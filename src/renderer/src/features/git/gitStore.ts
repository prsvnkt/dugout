import { create } from 'zustand'
import type { GitStatus } from '@shared/git'
import type { Result } from '@shared/result'
import type { GitCheckout } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'
import { togglePanelView, type RightPanelView } from './rightPanel'

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

export interface CommitOptions {
  readonly includeAll?: boolean
  readonly andPush?: boolean
}

interface GitState {
  readonly byCheckout: Readonly<Record<string, ProjectGitState>>
  readonly isPanelOpen: boolean
  readonly panelView: RightPanelView
  togglePanel(): void
  setPanelOpen(isOpen: boolean): void
  /** Shows `view`, or hides the panel when it already shows it (the activity rail buttons). */
  togglePanelView(view: RightPanelView): void
  refresh(checkout: GitCheckout): Promise<void>
  stage(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  unstage(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  discard(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  /**
   * Resolves true when the commit succeeded, so the caller can clear its message.
   * `includeAll` stages every change first; `andPush` pushes after a successful commit.
   */
  commit(checkout: GitCheckout, message: string, options?: CommitOptions): Promise<boolean>
  /** Fetches every remote, then refreshes the ahead/behind counts. */
  fetch(checkout: GitCheckout): Promise<void>
  push(checkout: GitCheckout): Promise<void>
  /** Resolve true on success. */
  switchBranch(
    checkout: GitCheckout,
    branch: { kind: 'local' | 'remote'; name: string },
  ): Promise<boolean>
  createBranch(checkout: GitCheckout, name: string, startPoint?: string): Promise<boolean>
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
    panelView: 'review',
    togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
    togglePanelView: (view) => set((state) => togglePanelView(state, view)),
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
    async commit(checkout, message, options = {}) {
      const { includeAll = false, andPush = false } = options
      const isCommitted = await runAction(checkout, () =>
        dugout.git.commit(checkout, message, { includeAll }),
      )
      if (isCommitted && andPush) await get().push(checkout)
      return isCommitted
    },
    fetch: (checkout) => runAction(checkout, () => dugout.git.fetch(checkout)).then(() => {}),
    push: (checkout) => runAction(checkout, () => dugout.git.push(checkout)).then(() => {}),
    switchBranch: (checkout, branch) =>
      runAction(checkout, () => dugout.git.switchBranch(checkout, branch)),
    createBranch: (checkout, name, startPoint) =>
      runAction(checkout, () => dugout.git.createBranch(checkout, name, startPoint)),
    openPullRequest: (checkout) =>
      runAction(checkout, () => dugout.git.openPullRequest(checkout)).then(() => {}),
  }
})

export function useCheckoutGit(checkout: GitCheckout): ProjectGitState {
  const key = checkoutKey(checkout)
  return useGitStore((state) => state.byCheckout[key] ?? INITIAL)
}
