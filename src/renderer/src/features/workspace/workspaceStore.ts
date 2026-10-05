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

interface WorkspaceState {
  readonly layouts: Readonly<Record<ProjectId, ProjectLayout>>
  addPane(projectId: ProjectId, kind: TerminalKind): void
  closePane(projectId: ProjectId, paneId: PaneId): void
  closeFocusedPane(projectId: ProjectId): void
  focusPane(projectId: ProjectId, paneId: PaneId): void
  removeProject(projectId: ProjectId): void
}

const createPaneId = () => crypto.randomUUID()

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  const updateLayout = (projectId: ProjectId, change: (layout: ProjectLayout) => ProjectLayout) =>
    set((state) => ({
      layouts: { ...state.layouts, [projectId]: change(state.layouts[projectId] ?? EMPTY_LAYOUT) },
    }))

  return {
    layouts: {},
    addPane: (projectId, kind) =>
      updateLayout(projectId, (layout) => addPane(layout, kind, createPaneId)),
    closePane: (projectId, paneId) =>
      updateLayout(projectId, (layout) => closePane(layout, paneId)),
    closeFocusedPane: (projectId) => {
      const focused = get().layouts[projectId]?.focusedPaneId
      if (focused) get().closePane(projectId, focused)
    },
    focusPane: (projectId, paneId) =>
      updateLayout(projectId, (layout) => focusPane(layout, paneId)),
    removeProject: (projectId) =>
      set((state) => ({
        layouts: Object.fromEntries(
          Object.entries(state.layouts).filter(([id]) => id !== projectId),
        ),
      })),
  }
})

export function useProjectLayout(projectId: ProjectId): ProjectLayout {
  return useWorkspaceStore((state) => state.layouts[projectId] ?? EMPTY_LAYOUT)
}
