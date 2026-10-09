import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import {
  gitProjectRequestSchema,
  gitPullRequestRequestSchema,
  type GitProjectRequest,
} from '@shared/ipc/contract'
import type { FailingCheck, PullRequestStatus, PullReviewThread } from '@shared/pullRequest'
import type { GitHubPullFeedback } from '../services/github/GitHubPullFeedback'
import type { GitHubPulls } from '../services/github/GitHubPulls'
import { githubRepoFromRemote, type GitHubRepoRef } from '../services/tasks/githubRepo'
import { resolveGitHubBranch, type GitHubBranchDeps } from './githubBranch'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

export interface PullRequestIpcDeps extends GitHubBranchDeps {
  readonly pulls: GitHubPulls
  readonly feedback: GitHubPullFeedback
  readonly openExternal: (url: string) => Promise<void>
}

export function registerPullRequestIpc(deps: PullRequestIpcDeps): void {
  /** The checkout's GitHub repo; fails when its remote is not on GitHub. */
  const requireRepo = async (request: GitProjectRequest): Promise<GitHubRepoRef> => {
    const project = findProject(deps.projects, request.projectId)
    const root = await deps.worktrees.resolveCheckout(project, request.worktreePath)
    const remote = await deps.git.remoteUrl(root)
    const repo = remote ? githubRepoFromRemote(remote, deps.webBaseUrl) : null
    if (!repo) throw new Error('This project is not on GitHub.')
    return repo
  }

  /** The checkout's branch PR with reviews and checks; null when there is none to show. */
  handleRequest(
    IpcChannel.gitPullRequestStatus,
    gitProjectRequestSchema,
    async (request): Promise<PullRequestStatus | null> => {
      const target = await resolveGitHubBranch(deps, request)
      if (!target) return null
      return deps.auth.withToken((token) => deps.pulls.forBranch(token, target.repo, target.branch))
    },
  )

  handleRequest(
    IpcChannel.gitPullRequestReviewThreads,
    gitPullRequestRequestSchema,
    async (request): Promise<PullReviewThread[]> => {
      const repo = await requireRepo(request)
      return deps.auth.withToken((token) =>
        deps.feedback.reviewThreads(token, repo, request.number),
      )
    },
  )

  handleRequest(
    IpcChannel.gitPullRequestFailingChecks,
    gitPullRequestRequestSchema,
    async (request): Promise<FailingCheck[]> => {
      const repo = await requireRepo(request)
      return deps.auth.withToken((token) =>
        deps.feedback.failingChecks(token, repo, request.number),
      )
    },
  )

  // Pull request and check pages only: never an arbitrary URL from the renderer.
  handleRequest(IpcChannel.gitOpenUrl, z.object({ url: z.url() }), async ({ url }) => {
    const allowed = [new URL(deps.webBaseUrl).origin]
    if (!allowed.includes(new URL(url).origin)) throw new Error('Only GitHub links can be opened.')
    await deps.openExternal(url)
  })
}
