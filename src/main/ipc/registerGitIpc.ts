import { IpcChannel } from '@shared/ipc/channels'
import {
  gitCommitRequestSchema,
  gitCreateBranchRequestSchema,
  gitSwitchBranchRequestSchema,
  gitPathsRequestSchema,
  gitProjectRequestSchema,
  gitShowRequestSchema,
} from '@shared/ipc/contract'
import type { Project, ProjectId } from '@shared/project'
import type { GitService } from '../services/git/GitService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { taskNumberFromBranch } from '../services/tasks/taskSession'
import { handleRequest } from './handle'

const PULL_REQUEST_HOSTS = ['https://github.com/', 'https://gitlab.com/']

export interface GitIpcDeps {
  readonly projects: ProjectStore
  readonly git: GitService
  readonly worktrees: WorktreeManager
  readonly openExternal: (url: string) => Promise<void>
  /** Called after a PR is opened from a task branch (dugout/<number>-…). */
  readonly onTaskPullRequest?: (projectId: ProjectId, taskNumber: number) => void
}

export function findProject(projects: ProjectStore, projectId: ProjectId): Project {
  const project = projects.list().find((candidate) => candidate.id === projectId)
  if (!project) throw new Error('Project not found.')
  return project
}

/**
 * The renderer names a project (and optionally one of its worktrees), never a folder: main
 * resolves and validates the path, so the UI cannot run git outside the user's projects.
 */
export function registerGitIpc(deps: GitIpcDeps): void {
  const { projects, git, worktrees, openExternal } = deps
  const rootOf = (request: { projectId: ProjectId; worktreePath?: string | undefined }) =>
    worktrees.resolveCheckout(findProject(projects, request.projectId), request.worktreePath)

  handleRequest(IpcChannel.gitStatus, gitProjectRequestSchema, async (request) =>
    git.status(await rootOf(request)),
  )
  handleRequest(IpcChannel.gitShow, gitShowRequestSchema, async (request) =>
    git.showFile(await rootOf(request), request.revision, request.path),
  )
  handleRequest(IpcChannel.gitStage, gitPathsRequestSchema, async (request) =>
    git.stage(await rootOf(request), request.paths),
  )
  handleRequest(IpcChannel.gitUnstage, gitPathsRequestSchema, async (request) =>
    git.unstage(await rootOf(request), request.paths),
  )
  handleRequest(IpcChannel.gitDiscard, gitPathsRequestSchema, async (request) =>
    git.discard(await rootOf(request), request.paths),
  )
  handleRequest(IpcChannel.gitCommit, gitCommitRequestSchema, async (request) =>
    git.commit(await rootOf(request), request.message, { includeAll: request.includeAll }),
  )
  handleRequest(IpcChannel.gitBranches, gitProjectRequestSchema, async (request) =>
    git.listBranches(await rootOf(request)),
  )
  handleRequest(IpcChannel.gitSwitchBranch, gitSwitchBranchRequestSchema, async (request) =>
    git.switchBranch(await rootOf(request), { kind: request.kind, name: request.name }),
  )
  handleRequest(IpcChannel.gitCreateBranch, gitCreateBranchRequestSchema, async (request) =>
    git.createBranch(await rootOf(request), request.name, request.startPoint),
  )
  handleRequest(IpcChannel.gitPush, gitProjectRequestSchema, async (request) =>
    git.push(await rootOf(request)),
  )
  handleRequest(IpcChannel.gitOpenPullRequest, gitProjectRequestSchema, async (request) => {
    const root = await rootOf(request)
    const url = await git.pullRequestUrl(root)
    if (!PULL_REQUEST_HOSTS.some((host) => url.startsWith(host))) {
      throw new Error('Refusing to open an unexpected URL.')
    }
    const status = await git.status(root)
    if (status.upstream === null || status.ahead > 0) await git.push(root)
    await openExternal(url)
    const taskNumber = taskNumberFromBranch(status.branch)
    if (taskNumber !== null) deps.onTaskPullRequest?.(request.projectId, taskNumber)
    return url
  })
}
