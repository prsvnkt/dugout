import type { PendingToolCall } from '@shared/toolCall'
import {
  withoutKeys,
  type PaneRuntimeSlice,
  type WorkspaceGet,
  type WorkspaceSet,
  type WorkspaceState,
} from './workspaceState'

const NO_APPROVALS: readonly PendingToolCall[] = []

type Activity = Parameters<PaneRuntimeSlice['setActivity']>

/** The activity and detail change; the same values return `state` itself (no re-render). */
function withActivity(
  state: WorkspaceState,
  [paneId, activity, detail = null, approvals = NO_APPROVALS]: Activity,
): Partial<WorkspaceState> | WorkspaceState {
  const isNewActivity = state.activities[paneId] !== activity
  const current = state.details[paneId]
  const isSame = current?.detail === detail && current.approvals === approvals
  if (!isNewActivity && isSame) return state
  const since = isNewActivity || !current ? Date.now() : current.since
  return {
    activities: isNewActivity ? { ...state.activities, [paneId]: activity } : state.activities,
    details: { ...state.details, [paneId]: { detail, approvals, since } },
  }
}

/** What each pane runs and is doing (from hooks), and which checkout and area have focus. */
export function createPaneRuntimeSlice(set: WorkspaceSet, get: WorkspaceGet): PaneRuntimeSlice {
  return {
    activities: {},
    terminalIds: {},
    details: {},
    subagents: {},
    gitCheckouts: {},
    focusedAreas: {},
    setTerminalId: (paneId, terminalId) =>
      set((state) => {
        if ((state.terminalIds[paneId] ?? null) === terminalId) return state
        return {
          terminalIds: terminalId
            ? { ...state.terminalIds, [paneId]: terminalId }
            : withoutKeys(state.terminalIds, [paneId]),
        }
      }),
    findTerminal: (terminalId) => {
      const { layouts, terminalIds } = get()
      const paneId = Object.keys(terminalIds).find((id) => terminalIds[id] === terminalId)
      if (!paneId) return null
      const projectId = Object.keys(layouts).find((id) =>
        layouts[id]?.panes.some((pane) => pane.id === paneId),
      )
      return projectId ? { projectId, paneId } : null
    },
    setActivity: (...args) => set((state) => withActivity(state, args)),
    setSubagents: (paneId, subagents) =>
      set((state) => {
        const current = state.subagents[paneId]
        if (current === subagents || (!current && subagents.length === 0)) return state
        return { subagents: { ...state.subagents, [paneId]: subagents } }
      }),
    selectCheckout: (projectId, worktreePath) =>
      set((state) =>
        state.gitCheckouts[projectId] === worktreePath
          ? state
          : { gitCheckouts: { ...state.gitCheckouts, [projectId]: worktreePath } },
      ),
    setFocusedArea: (projectId, area) =>
      set((state) =>
        state.focusedAreas[projectId] === area
          ? state
          : { focusedAreas: { ...state.focusedAreas, [projectId]: area } },
      ),
  }
}
