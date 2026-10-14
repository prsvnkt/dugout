import { create } from 'zustand'
import { useMemo } from 'react'
import type { ProjectId } from '@shared/project'
import type { GitCheckout } from '@shared/worktree'
import { EMPTY_LAYOUT, type ProjectLayout } from './layout'
import { projectAttention, type PaneActivity } from './paneActivity'
import { createPaneLayoutSlice } from './paneLayoutSlice'
import { createPaneRuntimeSlice } from './paneRuntimeSlice'
import type { RecentSession } from './recentSessions'
import { NO_RECENT, type WorkspaceState } from './workspaceState'

export type { FocusArea, PaneDetail } from './workspaceState'
export { toSnapshot } from './workspaceSnapshot'

/** Panes per project (paneLayoutSlice) and what each pane runs and does (paneRuntimeSlice). */
export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...createPaneLayoutSlice(set, get),
  ...createPaneRuntimeSlice(set, get),
}))

export function useProjectLayout(projectId: ProjectId): ProjectLayout {
  return useWorkspaceStore((state) => state.layouts[projectId] ?? EMPTY_LAYOUT)
}

/** The most urgent activity across a project's panes, for the sidebar. */
export function useProjectAttention(projectId: ProjectId): PaneActivity | null {
  return useWorkspaceStore((state) => {
    const panes = state.layouts[projectId]?.panes ?? []
    return projectAttention(panes.flatMap((pane) => state.activities[pane.id] ?? []))
  })
}

/** How many of a project's panes are in `activity`. */
export function useActivityCount(projectId: ProjectId, activity: PaneActivity): number {
  return useWorkspaceStore(
    (state) =>
      (state.layouts[projectId]?.panes ?? []).filter(
        (pane) => state.activities[pane.id] === activity,
      ).length,
  )
}

/** The checkout the git panel should show for a project. */
export function useSelectedCheckout(projectId: ProjectId): GitCheckout {
  const worktreePath = useWorkspaceStore((state) => state.gitCheckouts[projectId] ?? null)
  return useMemo(
    () => (worktreePath ? { projectId, worktreePath } : { projectId }),
    [projectId, worktreePath],
  )
}

/** A project's closed agent sessions, newest first. */
export function useRecentSessions(projectId: ProjectId): readonly RecentSession[] {
  return useWorkspaceStore((state) => state.recentSessions[projectId] ?? NO_RECENT)
}
