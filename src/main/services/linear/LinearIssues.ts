import type { LinearAccount, LinearTeam } from '@shared/linear'
import type { Task, TaskDetail } from '@shared/tasks'
import { withRelated } from '../tasks/relatedTasks'
import { MAX_LISTED_TASKS, type TaskInput, type TaskPatch } from '../tasks/taskTypes'
import { linearGraphql, type LinearApiDeps } from './linearGraphql'
import {
  IN_REVIEW_LABEL,
  linearStatusTarget,
  priorityFromLinear,
  priorityToLinear,
  statusOfLinear,
  type LinearWorkflowState,
} from './linearMapping'
import {
  CREATE_COMMENT_MUTATION,
  CREATE_ISSUE_MUTATION,
  CREATE_LABEL_MUTATION,
  ISSUE_QUERY,
  ISSUES_QUERY,
  LABELS_QUERY,
  TEAM_QUERY,
  TEAMS_QUERY,
  UPDATE_ISSUE_MUTATION,
  VIEWER_QUERY,
} from './linearQueries'

interface LabelNode {
  readonly id: string
  readonly name: string
}

export interface LinearIssueNode {
  readonly id: string
  readonly identifier: string
  readonly number: number
  readonly title: string
  readonly description: string | null
  readonly url: string
  readonly priority: number
  readonly updatedAt: string
  readonly creator: { readonly name: string } | null
  readonly state: { readonly name: string; readonly type: string }
  readonly labels: { readonly nodes: readonly LabelNode[] }
}

interface CommentNode {
  readonly body: string
  readonly createdAt: string
  readonly user: { readonly name: string } | null
}

interface LinearTeamNode {
  readonly id: string
  readonly key: string
  readonly states: { readonly nodes: readonly LinearWorkflowState[] }
}

interface IssuePayload {
  readonly success: boolean
  readonly issue: LinearIssueNode | null
}

const PAGE_SIZE = 100
const MAX_PAGES = MAX_LISTED_TASKS / PAGE_SIZE

export function linearIssueToTask(issue: LinearIssueNode): Task {
  const labels = issue.labels.nodes.map((label) => label.name)
  return {
    number: issue.number,
    key: issue.identifier,
    title: issue.title,
    body: issue.description ?? '',
    status: statusOfLinear(issue.state, labels),
    url: issue.url,
    author: issue.creator?.name ?? 'unknown',
    labels,
    priority: priorityFromLinear(issue.priority),
    commentCount: null,
    updatedAt: issue.updatedAt,
  }
}

function written(payload: IssuePayload, action: string): Task {
  if (!payload.success || !payload.issue) throw new Error(`Linear could not ${action} the issue.`)
  return linearIssueToTask(payload.issue)
}

const identifier = (teamKey: string, number: number) => `${teamKey}-${number}`
const relatedPrefix = (teamKey: string) => `${teamKey}-`

/** A Linear team's issues as project tasks. Every call takes the user's personal API key. */
export class LinearIssues {
  constructor(private readonly deps: LinearApiDeps) {}

  async viewer(apiKey: string): Promise<LinearAccount> {
    const { viewer } = await this.query<{
      viewer: { name: string; organization: { name: string } }
    }>(apiKey, VIEWER_QUERY)
    return { name: viewer.name, organization: viewer.organization.name }
  }

  async teams(apiKey: string): Promise<LinearTeam[]> {
    const { teams } = await this.query<{ teams: { nodes: LinearTeam[] } }>(apiKey, TEAMS_QUERY)
    return teams.nodes.map(({ key, name }) => ({ key, name }))
  }

  /** The team's issues (every state), most recently updated first. */
  async list(apiKey: string, teamKey: string): Promise<Task[]> {
    const tasks: Task[] = []
    let after: string | null = null
    for (let page = 0; page < MAX_PAGES; page++) {
      const { issues }: { issues: IssuesPage } = await this.query(apiKey, ISSUES_QUERY, {
        key: teamKey,
        first: PAGE_SIZE,
        after,
      })
      tasks.push(...issues.nodes.map(linearIssueToTask))
      if (!issues.pageInfo.hasNextPage) break
      after = issues.pageInfo.endCursor
    }
    return tasks
  }

  async get(apiKey: string, teamKey: string, number: number): Promise<TaskDetail> {
    const issue = await this.issue(apiKey, identifier(teamKey, number))
    const comments = [...issue.comments.nodes].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
    return {
      ...linearIssueToTask(issue),
      commentCount: comments.length,
      comments: comments.map((comment) => ({
        author: comment.user?.name ?? 'unknown',
        body: comment.body,
        createdAt: comment.createdAt,
      })),
    }
  }

  /** New issues land in the team's default state (Backlog or Triage), which reads as "to do". */
  async create(apiKey: string, teamKey: string, input: TaskInput): Promise<Task> {
    const team = await this.team(apiKey, teamKey)
    const labelIds = await this.labelIds(apiKey, team.id, input.labels ?? [])
    const { issueCreate } = await this.query<{ issueCreate: IssuePayload }>(
      apiKey,
      CREATE_ISSUE_MUTATION,
      {
        input: {
          teamId: team.id,
          title: input.title,
          description: withRelated(input.body, input.related ?? [], relatedPrefix(teamKey)),
          ...(input.priority && { priority: priorityToLinear(input.priority) }),
          ...(labelIds.length > 0 && { labelIds }),
        },
      },
    )
    return written(issueCreate, 'create')
  }

  async update(apiKey: string, teamKey: string, number: number, patch: TaskPatch): Promise<Task> {
    const current = await this.issue(apiKey, identifier(teamKey, number))
    const input = await this.updateInput(apiKey, teamKey, current, patch)
    const { issueUpdate } = await this.query<{ issueUpdate: IssuePayload }>(
      apiKey,
      UPDATE_ISSUE_MUTATION,
      { id: current.id, input },
    )
    return written(issueUpdate, 'update')
  }

  async comment(apiKey: string, teamKey: string, number: number, body: string): Promise<void> {
    const issue = await this.issue(apiKey, identifier(teamKey, number))
    const { commentCreate } = await this.query<{ commentCreate: { success: boolean } }>(
      apiKey,
      CREATE_COMMENT_MUTATION,
      { input: { issueId: issue.id, body } },
    )
    if (!commentCreate.success) throw new Error('Linear could not add the comment.')
  }

  /** The issueUpdate input for `patch`, given the issue as it is now. */
  private async updateInput(
    apiKey: string,
    teamKey: string,
    current: LinearIssueNode,
    patch: TaskPatch,
  ): Promise<Record<string, unknown>> {
    const names = current.labels.nodes.map((label) => label.name)
    const add = [...(patch.addLabels ?? [])]
    const remove = [...(patch.removeLabels ?? [])]
    let stateId: string | undefined
    let team: LinearTeamNode | null = null
    if (patch.status !== undefined && statusOfLinear(current.state, names) !== patch.status) {
      team = await this.team(apiKey, teamKey)
      const target = linearStatusTarget(team.states.nodes, patch.status)
      stateId = target.stateId
      ;(target.needsReviewLabel ? add : remove).push(IN_REVIEW_LABEL)
    }
    const toAdd = add.filter((name) => !names.includes(name))
    if (toAdd.length > 0) team ??= await this.team(apiKey, teamKey)
    const addedLabelIds = team ? await this.labelIds(apiKey, team.id, toAdd) : []
    const removedLabelIds = current.labels.nodes
      .filter((label) => remove.includes(label.name) && !add.includes(label.name))
      .map((label) => label.id)
    const description =
      patch.related !== undefined
        ? withRelated(
            patch.body ?? current.description ?? '',
            patch.related,
            relatedPrefix(teamKey),
          )
        : patch.body
    return {
      ...(patch.title !== undefined && { title: patch.title }),
      ...(description !== undefined && { description }),
      ...(stateId && { stateId }),
      ...(patch.priority !== undefined && { priority: priorityToLinear(patch.priority) }),
      ...(addedLabelIds.length > 0 && { addedLabelIds }),
      ...(removedLabelIds.length > 0 && { removedLabelIds }),
    }
  }

  private async issue(
    apiKey: string,
    id: string,
  ): Promise<LinearIssueNode & { comments: { nodes: CommentNode[] } }> {
    const { issue } = await this.query<{
      issue: (LinearIssueNode & { comments: { nodes: CommentNode[] } }) | null
    }>(apiKey, ISSUE_QUERY, { id })
    if (!issue) throw new Error(`Linear issue ${id} was not found.`)
    return issue
  }

  private async team(apiKey: string, teamKey: string): Promise<LinearTeamNode> {
    const { teams } = await this.query<{ teams: { nodes: LinearTeamNode[] } }>(apiKey, TEAM_QUERY, {
      key: teamKey,
    })
    const [team] = teams.nodes
    if (!team) throw new Error(`No Linear team with the key ${teamKey}.`)
    return team
  }

  /** Label ids by name: the team's or the workspace's; missing ones are created in the team. */
  private async labelIds(
    apiKey: string,
    teamId: string,
    names: readonly string[],
  ): Promise<string[]> {
    const wanted = [...new Set(names)]
    if (wanted.length === 0) return []
    const { issueLabels } = await this.query<{
      issueLabels: { nodes: (LabelNode & { team: { id: string } | null })[] }
    }>(apiKey, LABELS_QUERY, { names: wanted })
    const usable = issueLabels.nodes.filter((label) => !label.team || label.team.id === teamId)
    const ids: string[] = []
    for (const name of wanted) {
      const existing = usable.find((label) => label.name === name)
      ids.push(existing ? existing.id : await this.createLabel(apiKey, teamId, name))
    }
    return ids
  }

  private async createLabel(apiKey: string, teamId: string, name: string): Promise<string> {
    const { issueLabelCreate } = await this.query<{
      issueLabelCreate: { success: boolean; issueLabel: LabelNode | null }
    }>(apiKey, CREATE_LABEL_MUTATION, { input: { name, teamId } })
    if (!issueLabelCreate.success || !issueLabelCreate.issueLabel) {
      throw new Error(`Linear could not create the label ${name}.`)
    }
    return issueLabelCreate.issueLabel.id
  }

  private query<T>(apiKey: string, query: string, variables?: Record<string, unknown>) {
    return linearGraphql<T>(this.deps, apiKey, query, variables)
  }
}

interface IssuesPage {
  readonly nodes: readonly LinearIssueNode[]
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null }
}
