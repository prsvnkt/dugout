import type { Project, ProjectId } from '@shared/project'
import type { Task, TaskDetail } from '@shared/tasks'
import type { GitHubIssues, TaskInput, TaskPatch } from './GitHubIssues'
import { githubRepoFromRemote, type GitHubRepoRef } from './githubRepo'

export interface TaskServiceDeps {
  readonly findProject: (projectId: ProjectId) => Project | undefined
  readonly remoteUrl: (root: string) => Promise<string | null>
  readonly withToken: <T>(call: (token: string) => Promise<T>) => Promise<T>
  readonly issues: GitHubIssues
  readonly webBaseUrl: string
}

const NO_GITHUB_REMOTE =
  'Tasks use GitHub Issues, and this project has no GitHub remote named "origin".'

/** A project's tasks, backed by the GitHub Issues of its origin repository. */
export class TaskService {
  constructor(private readonly deps: TaskServiceDeps) {}

  list(projectId: ProjectId): Promise<Task[]> {
    return this.withRepo(projectId, (token, repo) => this.deps.issues.list(token, repo))
  }

  get(projectId: ProjectId, number: number): Promise<TaskDetail> {
    return this.withRepo(projectId, (token, repo) => this.deps.issues.get(token, repo, number))
  }

  create(projectId: ProjectId, input: TaskInput): Promise<Task> {
    return this.withRepo(projectId, (token, repo) => this.deps.issues.create(token, repo, input))
  }

  update(projectId: ProjectId, number: number, patch: TaskPatch): Promise<Task> {
    return this.withRepo(projectId, (token, repo) =>
      this.deps.issues.update(token, repo, number, patch),
    )
  }

  comment(projectId: ProjectId, number: number, body: string): Promise<void> {
    return this.withRepo(projectId, (token, repo) =>
      this.deps.issues.comment(token, repo, number, body),
    )
  }

  private async withRepo<T>(
    projectId: ProjectId,
    call: (token: string, repo: GitHubRepoRef) => Promise<T>,
  ): Promise<T> {
    const project = this.deps.findProject(projectId)
    if (!project) throw new Error('Project not found.')
    const remote = await this.deps.remoteUrl(project.rootPath)
    const repo = remote ? githubRepoFromRemote(remote, this.deps.webBaseUrl) : null
    if (!repo) throw new Error(NO_GITHUB_REMOTE)
    return this.deps.withToken((token) => call(token, repo))
  }
}
