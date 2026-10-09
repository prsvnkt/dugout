import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { gitProjectRequestSchema } from '@shared/ipc/contract'
import type { PullRequestStatus } from '@shared/pullRequest'
import type { GitHubPulls } from '../services/github/GitHubPulls'
import { resolveGitHubBranch, type GitHubBranchDeps } from './githubBranch'
import { handleRequest } from './handle'

export interface PullRequestIpcDeps extends GitHubBranchDeps {
  readonly pulls: GitHubPulls
  readonly openExternal: (url: string) => Promise<void>
}

export function registerPullRequestIpc(deps: PullRequestIpcDeps): void {
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

  // Pull request and check pages only: never an arbitrary URL from the renderer.
  handleRequest(IpcChannel.gitOpenUrl, z.object({ url: z.url() }), async ({ url }) => {
    const allowed = [new URL(deps.webBaseUrl).origin]
    if (!allowed.includes(new URL(url).origin)) throw new Error('Only GitHub links can be opened.')
    await deps.openExternal(url)
  })
}
