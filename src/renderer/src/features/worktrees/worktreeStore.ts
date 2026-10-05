import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import type { Worktree } from '@shared/worktree'
import { dugout } from '@renderer/lib/dugout'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'

interface WorktreeState {
  readonly byProject: Readonly<Record<ProjectId, readonly Worktree[]>>
  readonly errors: Readonly<Record<ProjectId, string | null>>
  load(projectId: ProjectId): Promise<void>
  /** Creates a worktree on a new dugout/* branch and opens a Claude pane in it. */
  startSession(projectId: ProjectId): Promise<void>
  /** Removes the worktree, then closes its panes. Fails (keeping both) if it has uncommitted work. */
  remove(projectId: ProjectId, path: string): Promise<void>
  dismissError(projectId: ProjectId): void
}

const EMPTY: readonly Worktree[] = []

export const useWorktreeStore = create<WorktreeState>()((set, get) => {
  const setError = (projectId: ProjectId, error: string | null) =>
    set((state) => ({ errors: { ...state.errors, [projectId]: error } }))

  return {
    byProject: {},
    errors: {},

    async load(projectId) {
      const result = await dugout.worktrees.list(projectId)
      if (!result.ok) return setError(projectId, result.error)
      set((state) => ({ byProject: { ...state.byProject, [projectId]: result.data } }))
    },

    async startSession(projectId) {
      setError(projectId, null)
      const result = await dugout.worktrees.create(projectId)
      if (!result.ok) return setError(projectId, result.error)
      useWorkspaceStore.getState().addPane(projectId, 'claude', result.data)
      await get().load(projectId)
    },

    async remove(projectId, path) {
      setError(projectId, null)
      const result = await dugout.worktrees.remove(projectId, path)
      if (!result.ok) return setError(projectId, result.error)
      const workspace = useWorkspaceStore.getState()
      workspace.closeWorktreePanes(projectId, path)
      workspace.selectCheckout(projectId, null)
      await get().load(projectId)
    },

    dismissError: (projectId) => setError(projectId, null),
  }
})

export function useProjectWorktrees(projectId: ProjectId): readonly Worktree[] {
  return useWorktreeStore((state) => state.byProject[projectId] ?? EMPTY)
}
