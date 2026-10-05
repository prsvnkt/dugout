import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import type { TerminalKind } from '@shared/terminal'
import {
  addPane,
  closePane,
  EMPTY_LAYOUT,
  focusPane,
  type PaneId,
  type ProjectLayout,
} from './layout'
import { projectAttention, type PaneActivity } from './paneActivity'

interface WorkspaceState {
  readonly layouts: Readonly<Record<ProjectId, ProjectLayout>>
  readonly activities: Readonly<Record<PaneId, PaneActivity>>
  addPane(projectId: ProjectId, kind: TerminalKind): void
  closePane(projectId: ProjectId, paneId: PaneId): void
  closeFocusedPane(projectId: ProjectId): void
  focusPane(projectId: ProjectId, paneId: PaneId): void
  setActivity(paneId: PaneId, activity: PaneActivity): void
  removeProject(projectId: ProjectId): void
}

const createPaneId = () => crypto.randomUUID()

function withoutKeys<V>(record: Readonly<Record<string, V>>, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  const updateLayout = (projectId: ProjectId, change: (layout: ProjectLayout) => ProjectLayout) =>
    set((state) => ({
      layouts: { ...state.layouts, [projectId]: change(state.layouts[projectId] ?? EMPTY_LAYOUT) },
    }))

  return {
    layouts: {},
    activities: {},
    addPane: (projectId, kind) =>
      updateLayout(projectId, (layout) => addPane(layout, kind, createPaneId)),
    closePane: (projectId, paneId) => {
      updateLayout(projectId, (layout) => closePane(layout, paneId))
      set((state) => ({ activities: withoutKeys(state.activities, [paneId]) }))
    },
    closeFocusedPane: (projectId) => {
      const focused = get().layouts[projectId]?.focusedPaneId
      if (focused) get().closePane(projectId, focused)
    },
    focusPane: (projectId, paneId) =>
      updateLayout(projectId, (layout) => focusPane(layout, paneId)),
    setActivity: (paneId, activity) =>
      set((state) =>
        state.activities[paneId] === activity
          ? state
          : { activities: { ...state.activities, [paneId]: activity } },
      ),
    removeProject: (projectId) =>
      set((state) => {
        const paneIds = state.layouts[projectId]?.panes.map((pane) => pane.id) ?? []
        return {
          layouts: withoutKeys(state.layouts, [projectId]),
          activities: withoutKeys(state.activities, paneIds),
        }
      }),
  }
})

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
