import { create } from 'zustand'
import type { GitStatus } from '@shared/git'
import type { Result } from '@shared/result'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'

export interface ProjectGitState {
  readonly status: GitStatus | null
  readonly statusError: string | null
  readonly isBusy: boolean
  readonly actionError: string | null
}

const INITIAL: ProjectGitState = {
  status: null,
  statusError: null,
  isBusy: false,
  actionError: null,
}

/** Stable key for a checkout: the project, plus the worktree path when there is one. */
export function checkoutKey(checkout: GitCheckout): string {
  return checkout.worktreePath
    ? `${checkout.projectId}::${checkout.worktreePath}`
    : checkout.projectId
}

interface GitState {
  readonly byCheckout: Readonly<Record<string, ProjectGitState>>
  readonly isPanelOpen: boolean
  togglePanel(): void
  setPanelOpen(isOpen: boolean): void
  refresh(checkout: GitCheckout): Promise<void>
  stage(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  unstage(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  discard(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  /** Resolves true when the commit succeeded, so the caller can clear its message. */
  commit(checkout: GitCheckout, message: string): Promise<boolean>
  push(checkout: GitCheckout): Promise<void>
  openPullRequest(checkout: GitCheckout): Promise<void>
}

const refreshesInFlight = new Set<string>()

export const useGitStore = create<GitState>()((set, get) => {
  const patch = (checkout: GitCheckout, change: Partial<ProjectGitState>) => {
    const key = checkoutKey(checkout)
    set((state) => ({
      byCheckout: {
        ...state.byCheckout,
        [key]: { ...(state.byCheckout[key] ?? INITIAL), ...change },
      },
    }))
  }

  /** Runs a mutating git action, surfaces its error, then refreshes. */
  const runAction = async (checkout: GitCheckout, action: () => Promise<Result<unknown>>) => {
    patch(checkout, { isBusy: true, actionError: null })
    const result = await action()
    patch(checkout, { isBusy: false, actionError: result.ok ? null : result.error })
    await get().refresh(checkout)
    return result.ok
  }

  return {
    byCheckout: {},
    isPanelOpen: true,
    togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
    setPanelOpen: (isOpen) =>
      set((state) => (state.isPanelOpen === isOpen ? state : { isPanelOpen: isOpen })),

    async refresh(checkout) {
      const key = checkoutKey(checkout)
      if (refreshesInFlight.has(key)) return
      refreshesInFlight.add(key)
      try {
        const result = await dugout.git.status(checkout)
        const current = get().byCheckout[key]
        if (!result.ok) return patch(checkout, { statusError: result.error })
        if (current?.status && JSON.stringify(current.status) === JSON.stringify(result.data))
          return
        patch(checkout, { status: result.data, statusError: null })
      } finally {
        refreshesInFlight.delete(key)
      }
    },

    stage: (checkout, paths) =>
      runAction(checkout, () => dugout.git.stage(checkout, paths)).then(() => {}),
    unstage: (checkout, paths) =>
      runAction(checkout, () => dugout.git.unstage(checkout, paths)).then(() => {}),
    discard: (checkout, paths) =>
      runAction(checkout, () => dugout.git.discard(checkout, paths)).then(() => {}),
    commit: (checkout, message) => runAction(checkout, () => dugout.git.commit(checkout, message)),
    push: (checkout) => runAction(checkout, () => dugout.git.push(checkout)).then(() => {}),
    openPullRequest: (checkout) =>
      runAction(checkout, () => dugout.git.openPullRequest(checkout)).then(() => {}),
  }
})

export function useCheckoutGit(checkout: GitCheckout): ProjectGitState {
  const key = checkoutKey(checkout)
  return useGitStore((state) => state.byCheckout[key] ?? INITIAL)
}
