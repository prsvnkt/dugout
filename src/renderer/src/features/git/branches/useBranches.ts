import { useEffect, useState } from 'react'
import type { GitBranch } from '@shared/git'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'

export type BranchList =
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly branches: readonly GitBranch[] }
  | { readonly state: 'error'; readonly message: string }

/**
 * The checkout's branches, reloaded each time the picker opens. The last list stays visible
 * while the fresh one loads.
 */
export function useBranches(checkout: GitCheckout, isOpen: boolean): BranchList {
  const [list, setList] = useState<BranchList>({ state: 'loading' })

  useEffect(() => {
    if (!isOpen) return
    let isCurrent = true
    dugout.git.branches(checkout).then(
      (result) => {
        if (!isCurrent) return
        setList(
          result.ok
            ? { state: 'loaded', branches: result.data }
            : { state: 'error', message: result.error },
        )
      },
      (error: unknown) => {
        console.error('[git] listing branches failed', error)
        if (isCurrent) setList({ state: 'error', message: 'Could not list branches.' })
      },
    )
    return () => {
      isCurrent = false
    }
  }, [checkout, isOpen])

  return list
}
