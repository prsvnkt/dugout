import type { GitStatus } from '@shared/git'
import type { PullRequestStatus } from '@shared/pullRequest'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'
import { useBranchPoll } from './useBranchPoll'

const loadPullRequest = (checkout: GitCheckout) => dugout.git.pullRequestStatus(checkout)

/** The checkout's pull request, kept fresh while shown (see `useBranchPoll`). */
export function usePullRequestStatus(
  checkout: GitCheckout,
  status: GitStatus | null,
): PullRequestStatus | null {
  return useBranchPoll(checkout, status, loadPullRequest)
}
