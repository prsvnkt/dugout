import { create } from 'zustand'
import { MAX_COMPARED_WORKTREES, type WorktreeChanges } from '@shared/compare'
import type { ProjectId } from '@shared/project'
import { dugout } from '@renderer/lib/dugout'

interface OverlapState {
  /** What each live worktree changed since it left the base branch, per project. */
  readonly byProject: Readonly<Record<ProjectId, readonly WorktreeChanges[]>>
  /** Re-reads what each of `worktreePaths` changed. Fewer than two cannot overlap. */
  refresh(projectId: ProjectId, worktreePaths: readonly string[]): Promise<void>
}

const NONE: readonly WorktreeChanges[] = []
const refreshesInFlight = new Set<ProjectId>()

export const useOverlapStore = create<OverlapState>()((set, get) => {
  /** Stores `changes` unless they equal what is there (no new object, no re-render). */
  const store = (projectId: ProjectId, changes: readonly WorktreeChanges[]) => {
    const current = get().byProject[projectId] ?? NONE
    if (JSON.stringify(current) === JSON.stringify(changes)) return
    set((state) => ({ byProject: { ...state.byProject, [projectId]: changes } }))
  }

  return {
    byProject: {},

    async refresh(projectId, worktreePaths) {
      if (worktreePaths.length < 2) return store(projectId, NONE)
      if (refreshesInFlight.has(projectId)) return
      refreshesInFlight.add(projectId)
      try {
        const paths = worktreePaths.slice(0, MAX_COMPARED_WORKTREES)
        const result = await dugout.compare.changes(projectId, paths)
        if (result.ok) return store(projectId, result.data)
        // Advisory only: a worktree removed behind Dugout's back just hides the warnings.
        console.warn('Could not check worktrees for overlapping changes:', result.error)
        store(projectId, NONE)
      } finally {
        refreshesInFlight.delete(projectId)
      }
    },
  }
})

export function useWorktreeChanges(projectId: ProjectId): readonly WorktreeChanges[] {
  return useOverlapStore((state) => state.byProject[projectId] ?? NONE)
}
