import { useEffect, useState } from 'react'
import type { GitStatus } from '@shared/git'
import type { PullRequestStatus } from '@shared/pullRequest'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'

const REFRESH_INTERVAL_MS = 60_000

/**
 * The checkout's pull request, refreshed every minute while shown, on window focus, and whenever
 * the branch or its push state changes (e.g. after Push or Create PR).
 */
export function usePullRequestStatus(
  checkout: GitCheckout,
  status: GitStatus | null,
): PullRequestStatus | null {
  const [pullRequest, setPullRequest] = useState<PullRequestStatus | null>(null)
  const branchKey = status ? `${status.branch}:${status.upstream}:${status.ahead}` : null

  useEffect(() => {
    if (!branchKey) return
    let isCancelled = false
    const load = () =>
      void dugout.git.pullRequestStatus(checkout).then((result) => {
        if (!isCancelled) setPullRequest(result.ok ? result.data : null)
      })
    load()
    const timer = window.setInterval(load, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', load)
    return () => {
      isCancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [checkout, branchKey])

  return branchKey ? pullRequest : null
}
