import type { Project, ProjectId } from '@shared/project'
import { taskKey, taskSourceOf, type Task, type TaskDetail } from '@shared/tasks'
import type { LinearIssues } from '../linear/LinearIssues'
import type { GitHubIssues } from './GitHubIssues'
import { githubRepoFromRemote, type GitHubRepoRef } from './githubRepo'
import type { TaskInput, TaskPatch, TaskProvider } from './taskTypes'

export interface TaskServiceDeps {
  readonly findProject: (projectId: ProjectId) => Project | undefined
  readonly remoteUrl: (root: string) => Promise<string | null>
  readonly github: {
    readonly withToken: <T>(call: (token: string) => Promise<T>) => Promise<T>
    readonly issues: GitHubIssues
    readonly webBaseUrl: string
  }
  readonly linear: {
    readonly withKey: <T>(call: (apiKey: string) => Promise<T>) => Promise<T>
    readonly issues: LinearIssues
    /** https://linear.app: issue links are only opened on this origin. */
    readonly webOrigin: string
  }
}

const NO_GITHUB_REMOTE =
  'Tasks use GitHub Issues, and this project has no GitHub remote named "origin".'

function githubTasks(deps: TaskServiceDeps['github'], repo: GitHubRepoRef): TaskProvider {
  const { issues, withToken } = deps
  return {
    webOrigin: new URL(deps.webBaseUrl).origin,
    list: () => withToken((token) => issues.list(token, repo)),
    get: (number) => withToken((token) => issues.get(token, repo, number)),
    create: (input) => withToken((token) => issues.create(token, repo, input)),
    update: (number, patch) => withToken((token) => issues.update(token, repo, number, patch)),
    comment: (number, body) => withToken((token) => issues.comment(token, repo, number, body)),
  }
}

function linearTasks(deps: TaskServiceDeps['linear'], teamKey: string): TaskProvider {
  const { issues, withKey } = deps
  return {
    webOrigin: new URL(deps.webOrigin).origin,
    list: () => withKey((key) => issues.list(key, teamKey)),
    get: (number) => withKey((key) => issues.get(key, teamKey, number)),
    create: (input) => withKey((key) => issues.create(key, teamKey, input)),
    update: (number, patch) => withKey((key) => issues.update(key, teamKey, number, patch)),
    comment: (number, body) => withKey((key) => issues.comment(key, teamKey, number, body)),
  }
}

/**
 * A project's tasks, from its task source (decision 051): the GitHub Issues of its origin
 * repository (the default), or a Linear team's issues. Callers never see which.
 */
export class TaskService {
  constructor(private readonly deps: TaskServiceDeps) {}

  async list(projectId: ProjectId): Promise<Task[]> {
    return (await this.provider(projectId)).list()
  }

  async get(projectId: ProjectId, number: number): Promise<TaskDetail> {
    return (await this.provider(projectId)).get(number)
  }

  async create(projectId: ProjectId, input: TaskInput): Promise<Task> {
    return (await this.provider(projectId)).create(input)
  }

  async update(projectId: ProjectId, number: number, patch: TaskPatch): Promise<Task> {
    return (await this.provider(projectId)).update(number, patch)
  }

  async comment(projectId: ProjectId, number: number, body: string): Promise<void> {
    return (await this.provider(projectId)).comment(number, body)
  }

  /** How the task is written in its source ("#12", "ENG-12"), e.g. for "Closes …" in a PR. */
  keyFor(projectId: ProjectId, number: number): string {
    return taskKey(taskSourceOf(this.project(projectId)), number)
  }

  /** The task's page, checked to be on its source's own site before it is opened. */
  async webUrl(projectId: ProjectId, number: number): Promise<string> {
    const provider = await this.provider(projectId)
    const { url } = await provider.get(number)
    if (new URL(url).origin !== provider.webOrigin) throw new Error('Unexpected task URL.')
    return url
  }

  private project(projectId: ProjectId): Project {
    const project = this.deps.findProject(projectId)
    if (!project) throw new Error('Project not found.')
    return project
  }

  private async provider(projectId: ProjectId): Promise<TaskProvider> {
    const project = this.project(projectId)
    const source = taskSourceOf(project)
    if (source.kind === 'linear') return linearTasks(this.deps.linear, source.teamKey)
    const remote = await this.deps.remoteUrl(project.rootPath)
    const repo = remote ? githubRepoFromRemote(remote, this.deps.github.webBaseUrl) : null
    if (!repo) throw new Error(NO_GITHUB_REMOTE)
    return githubTasks(this.deps.github, repo)
  }
}
