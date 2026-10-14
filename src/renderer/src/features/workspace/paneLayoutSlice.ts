import type { ProjectId } from '@shared/project'
import {
  addPane,
  clearInitialPrompt,
  closePane,
  closeWorktreePanes,
  EMPTY_LAYOUT,
  focusPane,
  restartPane,
  setPaneSession,
  type ProjectLayout,
} from './layout'
import {
  forgetSession,
  forgetWorktreeSessions,
  rememberSession,
  toRecentSession,
  type RecentSession,
} from './recentSessions'
import { fromSnapshot } from './workspaceSnapshot'
import {
  NO_RECENT,
  withoutKeys,
  withoutPanes,
  type PaneLayoutSlice,
  type WorkspaceGet,
  type WorkspaceSet,
} from './workspaceState'

const createPaneId = () => crypto.randomUUID()

type LayoutChange = (layout: ProjectLayout) => ProjectLayout
type RecentChange = (list: readonly RecentSession[]) => readonly RecentSession[]

interface Updaters {
  /** Applies a pure layout change; unchanged results leave state alone (no re-render). */
  readonly layout: (projectId: ProjectId, change: LayoutChange) => void
  readonly recent: (projectId: ProjectId, change: RecentChange) => void
}

function createUpdaters(set: WorkspaceSet): Updaters {
  return {
    layout: (projectId, change) =>
      set((state) => {
        const current = state.layouts[projectId] ?? EMPTY_LAYOUT
        const next = change(current)
        return next === current ? state : { layouts: { ...state.layouts, [projectId]: next } }
      }),
    recent: (projectId, change) =>
      set((state) => {
        const current = state.recentSessions[projectId] ?? NO_RECENT
        const next = change(current)
        return next === current
          ? state
          : { recentSessions: { ...state.recentSessions, [projectId]: next } }
      }),
  }
}

type LayoutData = 'layouts' | 'recentSessions' | 'isRestored' | 'focusRequests'
type OpenActions = Pick<
  PaneLayoutSlice,
  | 'hydrate'
  | 'markRestored'
  | 'addPane'
  | 'clearInitialPrompt'
  | 'setPaneSession'
  | 'restartPane'
  | 'focusPane'
  | 'revealPane'
>
type CloseActions = Omit<PaneLayoutSlice, keyof OpenActions | LayoutData>

/** Restoring, adding, restarting and focusing panes. */
function createOpenActions(set: WorkspaceSet, get: WorkspaceGet, update: Updaters): OpenActions {
  const paneOf = (projectId: ProjectId, paneId: string) =>
    get().layouts[projectId]?.panes.find((candidate) => candidate.id === paneId)
  return {
    hydrate: (snapshot) => set({ isRestored: true, ...fromSnapshot(snapshot, createPaneId) }),
    markRestored: () => set((state) => (state.isRestored ? state : { isRestored: true })),
    addPane: (projectId, kind, worktree, extras) => {
      update.layout(projectId, (layout) => addPane(layout, kind, createPaneId, worktree, extras))
      get().selectCheckout(projectId, worktree?.path ?? null)
    },
    clearInitialPrompt: (projectId, paneId) =>
      update.layout(projectId, (layout) => clearInitialPrompt(layout, paneId)),
    setPaneSession: (projectId, paneId, sessionId) =>
      update.layout(projectId, (layout) => setPaneSession(layout, paneId, sessionId)),
    restartPane: (projectId, paneId, options) =>
      update.layout(projectId, (layout) => restartPane(layout, paneId, options)),
    focusPane: (projectId, paneId) => {
      get().setFocusedArea(projectId, 'terminal')
      update.layout(projectId, (layout) => focusPane(layout, paneId))
      // The git panel follows the focused pane's checkout.
      const pane = paneOf(projectId, paneId)
      if (pane) get().selectCheckout(projectId, pane.worktree?.path ?? null)
    },
    revealPane: (projectId, paneId) => {
      get().focusPane(projectId, paneId)
      set((state) => ({
        focusRequests: { ...state.focusRequests, [paneId]: (state.focusRequests[paneId] ?? 0) + 1 },
      }))
    },
  }
}

/** Closing panes (remembering agent sessions), resuming them, and dropping a project. */
function createCloseActions(set: WorkspaceSet, get: WorkspaceGet, update: Updaters): CloseActions {
  return {
    closePane: (projectId, paneId) => {
      const pane = get().layouts[projectId]?.panes.find((candidate) => candidate.id === paneId)
      const recent = pane ? toRecentSession(pane, Date.now()) : null
      if (recent) update.recent(projectId, (list) => rememberSession(list, recent))
      update.layout(projectId, (layout) => closePane(layout, paneId))
      set((state) => withoutPanes(state, [paneId]))
    },
    closeFocusedPane: (projectId) => {
      const focused = get().layouts[projectId]?.focusedPaneId
      if (focused) get().closePane(projectId, focused)
    },
    closeWorktreePanes: (projectId, worktreePath) => {
      const before = get().layouts[projectId]?.panes ?? []
      const closed = before.filter((pane) => pane.worktree?.path === worktreePath)
      update.layout(projectId, (layout) => closeWorktreePanes(layout, worktreePath))
      update.recent(projectId, (list) => forgetWorktreeSessions(list, worktreePath))
      const ids = closed.map((pane) => pane.id)
      set((state) => withoutPanes(state, ids))
    },
    resumeSession: (projectId, sessionId) => {
      const recent = get().recentSessions[projectId]?.find((entry) => entry.sessionId === sessionId)
      if (!recent) return
      const before = get().layouts[projectId]
      const { kind, worktree, title, task } = recent
      get().addPane(projectId, kind, worktree, { sessionId, title, task })
      // A full workspace adds nothing; keep the session on offer then.
      if (get().layouts[projectId] !== before) {
        update.recent(projectId, (list) => forgetSession(list, sessionId))
      }
    },
    removeProject: (projectId) =>
      set((state) => {
        const paneIds = state.layouts[projectId]?.panes.map((pane) => pane.id) ?? []
        return {
          layouts: withoutKeys(state.layouts, [projectId]),
          recentSessions: withoutKeys(state.recentSessions, [projectId]),
          gitCheckouts: withoutKeys(state.gitCheckouts, [projectId]),
          focusedAreas: withoutKeys(state.focusedAreas, [projectId]),
          ...withoutPanes(state, paneIds),
        }
      }),
  }
}

/** Panes per project (pure transitions in layout.ts) and the agent sessions closed from them. */
export function createPaneLayoutSlice(set: WorkspaceSet, get: WorkspaceGet): PaneLayoutSlice {
  const update = createUpdaters(set)
  return {
    layouts: {},
    recentSessions: {},
    isRestored: false,
    focusRequests: {},
    ...createOpenActions(set, get, update),
    ...createCloseActions(set, get, update),
  }
}
