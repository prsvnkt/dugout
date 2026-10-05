import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import type { TerminalId, TerminalKind } from '@shared/terminal'
import type { GitCheckout, Worktree } from '@shared/worktree'
import { useMemo } from 'react'
import {
  addPane,
  closePane,
  closeWorktreePanes,
  EMPTY_LAYOUT,
  focusPane,
  type PaneId,
  type ProjectLayout,
} from './layout'
import { projectAttention, type PaneActivity } from './paneActivity'

interface WorkspaceState {
  readonly layouts: Readonly<Record<ProjectId, ProjectLayout>>
  readonly activities: Readonly<Record<PaneId, PaneActivity>>
  readonly terminalIds: Readonly<Record<PaneId, TerminalId>>
  setTerminalId(paneId: PaneId, terminalId: TerminalId | null): void
  /** Finds the pane running a terminal, e.g. to reveal it from a notification. */
  findTerminal(terminalId: TerminalId): { projectId: ProjectId; paneId: PaneId } | null
  /** Which checkout the git panel shows per project: a worktree path, or null for main. */
  readonly gitCheckouts: Readonly<Record<ProjectId, string | null>>
  selectCheckout(projectId: ProjectId, worktreePath: string | null): void
  closeWorktreePanes(projectId: ProjectId, worktreePath: string): void
  addPane(projectId: ProjectId, kind: TerminalKind, worktree?: Worktree): void
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
    gitCheckouts: {},
    selectCheckout: (projectId, worktreePath) =>
      set((state) => ({ gitCheckouts: { ...state.gitCheckouts, [projectId]: worktreePath } })),
    closeWorktreePanes: (projectId, worktreePath) => {
      const before = get().layouts[projectId]?.panes ?? []
      const closed = before.filter((pane) => pane.worktree?.path === worktreePath)
      updateLayout(projectId, (layout) => closeWorktreePanes(layout, worktreePath))
      const ids = closed.map((pane) => pane.id)
      set((state) => ({
        activities: withoutKeys(state.activities, ids),
        terminalIds: withoutKeys(state.terminalIds, ids),
      }))
    },
    terminalIds: {},
    setTerminalId: (paneId, terminalId) =>
      set((state) => ({
        terminalIds: terminalId
          ? { ...state.terminalIds, [paneId]: terminalId }
          : withoutKeys(state.terminalIds, [paneId]),
      })),
    findTerminal: (terminalId) => {
      const { layouts, terminalIds } = get()
      const paneId = Object.keys(terminalIds).find((id) => terminalIds[id] === terminalId)
      if (!paneId) return null
      const projectId = Object.keys(layouts).find((id) =>
        layouts[id]?.panes.some((pane) => pane.id === paneId),
      )
      return projectId ? { projectId, paneId } : null
    },
    addPane: (projectId, kind, worktree) => {
      updateLayout(projectId, (layout) => addPane(layout, kind, createPaneId, worktree))
      get().selectCheckout(projectId, worktree?.path ?? null)
    },
    closePane: (projectId, paneId) => {
      updateLayout(projectId, (layout) => closePane(layout, paneId))
      set((state) => ({
        activities: withoutKeys(state.activities, [paneId]),
        terminalIds: withoutKeys(state.terminalIds, [paneId]),
      }))
    },
    closeFocusedPane: (projectId) => {
      const focused = get().layouts[projectId]?.focusedPaneId
      if (focused) get().closePane(projectId, focused)
    },
    focusPane: (projectId, paneId) => {
      updateLayout(projectId, (layout) => focusPane(layout, paneId))
      // The git panel follows the focused pane's checkout.
      const pane = get().layouts[projectId]?.panes.find((candidate) => candidate.id === paneId)
      if (pane) get().selectCheckout(projectId, pane.worktree?.path ?? null)
    },
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
          terminalIds: withoutKeys(state.terminalIds, paneIds),
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

/** The checkout the git panel should show for a project. */
export function useSelectedCheckout(projectId: ProjectId): GitCheckout {
  const worktreePath = useWorkspaceStore((state) => state.gitCheckouts[projectId] ?? null)
  return useMemo(
    () => (worktreePath ? { projectId, worktreePath } : { projectId }),
    [projectId, worktreePath],
  )
}
