import { useEffect, useState } from 'react'
import type { GitStatus } from '@shared/git'
import type { Result } from '@shared/result'
import type { GitCheckout } from '@shared/worktree'

const REFRESH_INTERVAL_MS = 60_000

/**
 * Something GitHub knows about the checkout's branch (its PR, its preview deployment), refreshed
 * every minute while shown, on window focus, and whenever the branch or its push state changes
 * (e.g. after Push or Create PR). `load` must be a stable function.
 */
export function useBranchPoll<T>(
  checkout: GitCheckout,
  status: GitStatus | null,
  load: (checkout: GitCheckout) => Promise<Result<T | null>>,
): T | null {
  const [value, setValue] = useState<T | null>(null)
  const branchKey = status ? `${status.branch}:${status.upstream}:${status.ahead}` : null

  useEffect(() => {
    if (!branchKey) return
    let isCancelled = false
    const refresh = () =>
      void load(checkout).then((result) => {
        if (!isCancelled) setValue(result.ok ? result.data : null)
      })
    refresh()
    const timer = window.setInterval(refresh, REFRESH_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      isCancelled = true
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [checkout, branchKey, load])

  return branchKey ? value : null
}
