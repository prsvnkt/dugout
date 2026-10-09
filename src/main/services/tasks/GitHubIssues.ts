import {
  TASK_PRIORITIES,
  type Task,
  type TaskDetail,
  type TaskPriority,
  type TaskStatus,
} from '@shared/tasks'
import { githubJson, githubRequest } from '../github/GitHubApi'
import type { GitHubRepoRef } from './githubRepo'
import { withRelated } from './relatedTasks'
import { labelsForPriority, PRIORITY_LABEL_COLORS, PRIORITY_LABELS } from './taskPriority'
import { labelsForStatus, STATUS_LABEL_COLORS, STATUS_LABELS, statusOf } from './taskStatus'

export interface GitHubIssuesDeps {
  readonly fetch: typeof globalThis.fetch
  readonly apiBaseUrl: string
}

export interface TaskInput {
  readonly title: string
  readonly body: string
  readonly labels?: readonly string[] | undefined
  readonly priority?: TaskPriority | undefined
  /** Task numbers written as "Related: #n" lines at the end of the description. */
  readonly related?: readonly number[] | undefined
}

export interface TaskPatch {
  readonly title?: string | undefined
  readonly body?: string | undefined
  readonly status?: TaskStatus | undefined
  /** `null` removes the priority. */
  readonly priority?: TaskPriority | null | undefined
  readonly addLabels?: readonly string[] | undefined
  readonly removeLabels?: readonly string[] | undefined
  readonly related?: readonly number[] | undefined
}

interface IssueResponse {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  user: { login: string } | null
  labels: (string | { name?: string })[]
  comments: number
  updated_at: string
  pull_request?: unknown
}

interface CommentResponse {
  user: { login: string } | null
  body: string | null
  created_at: string
}

/** The fields Dugout sends when it creates or edits an issue. */
interface IssueWrite {
  title?: string
  body?: string
  state?: 'open' | 'closed'
  labels?: string[]
}

const PAGE_SIZE = 100
const MAX_PAGES = 3
/** `list` returns at most this many tasks: the most recently updated ones. */
export const MAX_LISTED_TASKS = PAGE_SIZE * MAX_PAGES
const NOT_FOUND = 404

/** Dugout's own labels, created in these colours the first time they are used. */
const DUGOUT_LABEL_COLORS: ReadonlyMap<string, string> = new Map([
  [STATUS_LABELS['in-progress'], STATUS_LABEL_COLORS['in-progress']],
  [STATUS_LABELS['in-review'], STATUS_LABEL_COLORS['in-review']],
  ...TASK_PRIORITIES.map(
    (priority) => [PRIORITY_LABELS[priority], PRIORITY_LABEL_COLORS[priority]] as const,
  ),
])

function labelNames(issue: IssueResponse): string[] {
  return issue.labels
    .map((label) => (typeof label === 'string' ? label : label.name))
    .filter((name): name is string => Boolean(name))
}

function toTask(issue: IssueResponse): Task {
  const labels = labelNames(issue)
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    status: statusOf(issue.state, labels),
    url: issue.html_url,
    author: issue.user?.login ?? 'unknown',
    labels,
    commentCount: issue.comments,
    updatedAt: issue.updated_at,
  }
}

/** Status, priority, label and related changes build on the issue's current labels and body. */
function needsCurrentIssue(patch: TaskPatch): boolean {
  return (
    patch.status !== undefined ||
    patch.priority !== undefined ||
    patch.addLabels !== undefined ||
    patch.removeLabels !== undefined ||
    patch.related !== undefined
  )
}

function titleAndBody(patch: TaskPatch): IssueWrite {
  return {
    ...(patch.title !== undefined && { title: patch.title }),
    ...(patch.body !== undefined && { body: patch.body }),
  }
}

function patchedLabels(labels: readonly string[], patch: TaskPatch): IssueWrite {
  const withStatus =
    patch.status !== undefined ? labelsForStatus(labels, patch.status) : { labels: [...labels] }
  const withPriority =
    patch.priority !== undefined
      ? labelsForPriority(withStatus.labels, patch.priority)
      : withStatus.labels
  const removed = new Set(patch.removeLabels ?? [])
  const kept = withPriority.filter((label) => !removed.has(label))
  return {
    ...('state' in withStatus && { state: withStatus.state }),
    labels: [...new Set([...kept, ...(patch.addLabels ?? [])])],
  }
}

/** The PATCH body for `patch`, given the issue as it is now. */
function issueUpdate(current: IssueResponse, patch: TaskPatch): IssueWrite {
  const body =
    patch.related !== undefined
      ? withRelated(patch.body ?? current.body ?? '', patch.related)
      : patch.body
  return {
    ...titleAndBody(patch),
    ...(body !== undefined && { body }),
    ...patchedLabels(labelNames(current), patch),
  }
}

/** Project tasks stored as GitHub Issues, with Dugout status and priority labels. */
export class GitHubIssues {
  constructor(private readonly deps: GitHubIssuesDeps) {}

  /** Open and closed issues (pull requests excluded), most recently updated first. */
  async list(token: string, repo: GitHubRepoRef): Promise<Task[]> {
    const tasks: Task[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const query = new URLSearchParams({
        state: 'all',
        sort: 'updated',
        per_page: String(PAGE_SIZE),
        page: String(page),
      })
      const batch = await this.request<IssueResponse[]>(
        token,
        'GET',
        `${this.base(repo)}/issues?${query}`,
      )
      tasks.push(...batch.filter((issue) => issue.pull_request === undefined).map(toTask))
      if (batch.length < PAGE_SIZE) break
    }
    return tasks
  }

  async get(token: string, repo: GitHubRepoRef, number: number): Promise<TaskDetail> {
    const [issue, comments] = await Promise.all([
      this.request<IssueResponse>(token, 'GET', `${this.base(repo)}/issues/${number}`),
      this.request<CommentResponse[]>(
        token,
        'GET',
        `${this.base(repo)}/issues/${number}/comments?per_page=100`,
      ),
    ])
    return {
      ...toTask(issue),
      comments: comments.map((comment) => ({
        author: comment.user?.login ?? 'unknown',
        body: comment.body ?? '',
        createdAt: comment.created_at,
      })),
    }
  }

  /** Labels that do not exist yet are created by GitHub; Dugout's own ones in its colours. */
  async create(token: string, repo: GitHubRepoRef, input: TaskInput): Promise<Task> {
    const labels = labelsForPriority(input.labels ?? [], input.priority ?? null)
    await this.ensureDugoutLabels(token, repo, labels)
    const issue: IssueWrite = {
      title: input.title,
      body: withRelated(input.body, input.related ?? []),
      ...(labels.length > 0 && { labels }),
    }
    return toTask(
      await this.request<IssueResponse>(token, 'POST', `${this.base(repo)}/issues`, issue),
    )
  }

  async update(
    token: string,
    repo: GitHubRepoRef,
    number: number,
    patch: TaskPatch,
  ): Promise<Task> {
    const path = `${this.base(repo)}/issues/${number}`
    const current = needsCurrentIssue(patch)
      ? await this.request<IssueResponse>(token, 'GET', path)
      : null
    const issue = current ? issueUpdate(current, patch) : titleAndBody(patch)
    await this.ensureDugoutLabels(token, repo, issue.labels ?? [])
    return toTask(await this.request<IssueResponse>(token, 'PATCH', path, issue))
  }

  async comment(token: string, repo: GitHubRepoRef, number: number, text: string): Promise<void> {
    await this.request(token, 'POST', `${this.base(repo)}/issues/${number}/comments`, {
      body: text,
    })
  }

  private async ensureDugoutLabels(
    token: string,
    repo: GitHubRepoRef,
    labels: readonly string[],
  ): Promise<void> {
    for (const label of labels) {
      const color = DUGOUT_LABEL_COLORS.get(label)
      if (color) await this.ensureLabel(token, repo, label, color)
    }
  }

  /** Creates one of Dugout's labels in the repo the first time it is needed. */
  private async ensureLabel(token: string, repo: GitHubRepoRef, name: string, color: string) {
    const path = `${this.base(repo)}/labels/${encodeURIComponent(name).replace(/%3A/g, ':')}`
    const existing = await this.send(token, 'GET', path)
    if (existing.ok) return
    if (existing.status !== NOT_FOUND) throw new Error(`Could not check label ${name}.`)
    await this.request(token, 'POST', `${this.base(repo)}/labels`, {
      name,
      color,
      description: 'Tracked by Dugout',
    })
  }

  private base(repo: GitHubRepoRef): string {
    return `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`
  }

  private request<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
    return githubJson<T>(this.deps, token, method, path, body)
  }

  private send(token: string, method: string, path: string, body?: unknown): Promise<Response> {
    return githubRequest(this.deps, token, method, path, body)
  }
}
