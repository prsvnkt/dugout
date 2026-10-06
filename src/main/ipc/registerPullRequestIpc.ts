import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { gitProjectRequestSchema } from '@shared/ipc/contract'
import type { PullRequestStatus } from '@shared/pullRequest'
import type { GitService } from '../services/git/GitService'
import type { GitHubAuth } from '../services/github/GitHubAuth'
import type { GitHubPulls } from '../services/github/GitHubPulls'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { githubRepoFromRemote } from '../services/tasks/githubRepo'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

export interface PullRequestIpcDeps {
  readonly projects: ProjectStore
  readonly worktrees: WorktreeManager
  readonly git: GitService
  readonly auth: GitHubAuth
  readonly pulls: GitHubPulls
  readonly webBaseUrl: string
  readonly openExternal: (url: string) => Promise<void>
}

export function registerPullRequestIpc(deps: PullRequestIpcDeps): void {
  /** The checkout's branch PR with reviews and checks; null when there is none to show. */
  handleRequest(
    IpcChannel.gitPullRequestStatus,
    gitProjectRequestSchema,
    async (request): Promise<PullRequestStatus | null> => {
      const project = findProject(deps.projects, request.projectId)
      const root = await deps.worktrees.resolveCheckout(project, request.worktreePath)
      const status = await deps.git.status(root)
      const remote = await deps.git.remoteUrl(root)
      const repo = remote ? githubRepoFromRemote(remote, deps.webBaseUrl) : null
      if (!status.branch || !repo || !(await deps.auth.freshToken())) return null
      const branch = status.branch
      return deps.auth.withToken((token) => deps.pulls.forBranch(token, repo, branch))
    },
  )

  // Pull request and check pages only: never an arbitrary URL from the renderer.
  handleRequest(IpcChannel.gitOpenUrl, z.object({ url: z.url() }), async ({ url }) => {
    const allowed = [new URL(deps.webBaseUrl).origin]
    if (!allowed.includes(new URL(url).origin)) throw new Error('Only GitHub links can be opened.')
    await deps.openExternal(url)
  })
}
