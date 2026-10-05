import { create } from 'zustand'
import type { GitDiff, GitStatus } from '@shared/git'
import type { ProjectId } from '@shared/project'
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

interface GitState {
  readonly byProject: Readonly<Record<ProjectId, ProjectGitState>>
  readonly isPanelOpen: boolean
  togglePanel(): void
  refresh(projectId: ProjectId): Promise<void>
  select(projectId: ProjectId, selection: GitSelection | null): Promise<void>
  stage(projectId: ProjectId, paths: readonly string[]): Promise<void>
  unstage(projectId: ProjectId, paths: readonly string[]): Promise<void>
  discard(projectId: ProjectId, paths: readonly string[]): Promise<void>
  /** Resolves true when the commit succeeded, so the caller can clear its message. */
  commit(projectId: ProjectId, message: string): Promise<boolean>
  push(projectId: ProjectId): Promise<void>
  openPullRequest(projectId: ProjectId): Promise<void>
}

const refreshesInFlight = new Set<ProjectId>()

function isStillListed(status: GitStatus, selection: GitSelection): boolean {
  return status.files.some(
    (file) =>
      file.path === selection.path &&
      (selection.staged ? file.staged !== null : file.unstaged !== null),
  )
}

export const useGitStore = create<GitState>()((set, get) => {
  const patch = (projectId: ProjectId, change: Partial<ProjectGitState>) =>
    set((state) => ({
      byProject: {
        ...state.byProject,
        [projectId]: { ...(state.byProject[projectId] ?? INITIAL), ...change },
      },
    }))
  const current = (projectId: ProjectId) => get().byProject[projectId] ?? INITIAL

  const loadDiff = async (projectId: ProjectId, selection: GitSelection | null) => {
    if (!selection) return patch(projectId, { diff: null })
    const result = await dugout.git.diff(projectId, selection.path, selection.staged)
    if (current(projectId).selection !== selection) return // selection changed meanwhile
    patch(projectId, result.ok ? { diff: result.data } : { diff: null, actionError: result.error })
  }

  /** Runs a mutating git action, surfaces its error, then refreshes. */
  const runAction = async (projectId: ProjectId, action: () => Promise<Result<void>>) => {
    patch(projectId, { isBusy: true, actionError: null })
    const result = await action()
    patch(projectId, { isBusy: false, actionError: result.ok ? null : result.error })
    await get().refresh(projectId)
    return result.ok
  }

  return {
    byProject: {},
    isPanelOpen: true,
    togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),

    async refresh(projectId) {
      if (refreshesInFlight.has(projectId)) return
      refreshesInFlight.add(projectId)
      try {
        const result = await dugout.git.status(projectId)
        if (!result.ok) return patch(projectId, { statusError: result.error })
        const { selection } = current(projectId)
        const keepSelection = selection && isStillListed(result.data, selection) ? selection : null
        patch(projectId, { status: result.data, statusError: null, selection: keepSelection })
        await loadDiff(projectId, keepSelection)
      } finally {
        refreshesInFlight.delete(projectId)
      }
    },

    async select(projectId, selection) {
      patch(projectId, { selection, diff: null })
      await loadDiff(projectId, selection)
    },

    stage: (projectId, paths) =>
      runAction(projectId, () => dugout.git.stage(projectId, paths)).then(() => {}),
    unstage: (projectId, paths) =>
      runAction(projectId, () => dugout.git.unstage(projectId, paths)).then(() => {}),
    discard: (projectId, paths) =>
      runAction(projectId, () => dugout.git.discard(projectId, paths)).then(() => {}),
    commit: (projectId, message) =>
      runAction(projectId, () => dugout.git.commit(projectId, message)),
    push: (projectId) => runAction(projectId, () => dugout.git.push(projectId)).then(() => {}),
    openPullRequest: (projectId) =>
      runAction(projectId, async () => {
        const result = await dugout.git.openPullRequest(projectId)
        return result.ok ? { ok: true, data: undefined } : result
      }).then(() => {}),
  }
})

export function useProjectGit(projectId: ProjectId): ProjectGitState {
  return useGitStore((state) => state.byProject[projectId] ?? INITIAL)
}
