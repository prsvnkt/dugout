import { create } from 'zustand'
import type { GitDiff, GitStatus } from '@shared/git'
import type { GitCheckout } from '@shared/worktree'
import type { Result } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'

export interface GitSelection {
  readonly path: string
  readonly staged: boolean
}

export interface ProjectGitState {
  readonly status: GitStatus | null
  readonly statusError: string | null
  readonly selection: GitSelection | null
  readonly diff: GitDiff | null
  readonly isBusy: boolean
  readonly actionError: string | null
}

const INITIAL: ProjectGitState = {
  status: null,
  statusError: null,
  selection: null,
  diff: null,
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
  refresh(checkout: GitCheckout): Promise<void>
  select(checkout: GitCheckout, selection: GitSelection | null): Promise<void>
  stage(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  unstage(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  discard(checkout: GitCheckout, paths: readonly string[]): Promise<void>
  /** Resolves true when the commit succeeded, so the caller can clear its message. */
  commit(checkout: GitCheckout, message: string): Promise<boolean>
  push(checkout: GitCheckout): Promise<void>
  openPullRequest(checkout: GitCheckout): Promise<void>
}

const refreshesInFlight = new Set<string>()

function isStillListed(status: GitStatus, selection: GitSelection): boolean {
  return status.files.some(
    (file) =>
      file.path === selection.path &&
      (selection.staged ? file.staged !== null : file.unstaged !== null),
  )
}

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
  const current = (checkout: GitCheckout) => get().byCheckout[checkoutKey(checkout)] ?? INITIAL

  const loadDiff = async (checkout: GitCheckout, selection: GitSelection | null) => {
    if (!selection) return patch(checkout, { diff: null })
    const result = await dugout.git.diff(checkout, selection.path, selection.staged)
    if (current(checkout).selection !== selection) return // selection changed meanwhile
    patch(checkout, result.ok ? { diff: result.data } : { diff: null, actionError: result.error })
  }

  /** Runs a mutating git action, surfaces its error, then refreshes. */
  const runAction = async (checkout: GitCheckout, action: () => Promise<Result<void>>) => {
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

    async refresh(checkout) {
      const key = checkoutKey(checkout)
      if (refreshesInFlight.has(key)) return
      refreshesInFlight.add(key)
      try {
        const result = await dugout.git.status(checkout)
        if (!result.ok) return patch(checkout, { statusError: result.error })
        const { selection } = current(checkout)
        const keepSelection = selection && isStillListed(result.data, selection) ? selection : null
        patch(checkout, { status: result.data, statusError: null, selection: keepSelection })
        await loadDiff(checkout, keepSelection)
      } finally {
        refreshesInFlight.delete(key)
      }
    },

    async select(checkout, selection) {
      patch(checkout, { selection, diff: null })
      await loadDiff(checkout, selection)
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
      runAction(checkout, async () => {
        const result = await dugout.git.openPullRequest(checkout)
        return result.ok ? { ok: true, data: undefined } : result
      }).then(() => {}),
  }
})

export function useCheckoutGit(checkout: GitCheckout): ProjectGitState {
  const key = checkoutKey(checkout)
  return useGitStore((state) => state.byCheckout[key] ?? INITIAL)
}
