import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import type { TerminalId, TerminalKind } from '@shared/terminal'
import type { ToolCallPreview } from '@shared/toolCall'
import type { GitCheckout, Worktree } from '@shared/worktree'
import { useMemo } from 'react'
import type { WorkspaceSnapshot } from '@shared/ipc/contract'
import {
  addPane,
  closePane,
  clearInitialPrompt,
  closeWorktreePanes,
  restartPane,
  setPaneSession,
  EMPTY_LAYOUT,
  focusPane,
  type Pane,
  type PaneExtras,
  type PaneId,
  type ProjectLayout,
} from './layout'
import type { Subagent } from '@renderer/features/agents/subagents'
import { projectAttention, type PaneActivity } from './paneActivity'
import {
  forgetSession,
  forgetWorktreeSessions,
  rememberSession,
  toRecentSession,
  type RecentSession,
} from './recentSessions'

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
  setPaneSession(projectId: ProjectId, paneId: PaneId, sessionId: string): void
  restartPane(projectId: ProjectId, paneId: PaneId, options?: { isFresh?: boolean }): void
  /** Replaces all layouts with saved panes (fresh ids), e.g. on launch. */
  hydrate(snapshot: WorkspaceSnapshot): void
  addPane(projectId: ProjectId, kind: TerminalKind, worktree?: Worktree, extras?: PaneExtras): void
  /** Called once the pane's session started, so its first prompt is never sent again. */
  clearInitialPrompt(projectId: ProjectId, paneId: PaneId): void
  /** Closes a pane; an agent's session is remembered so the start screen can resume it. */
  closePane(projectId: ProjectId, paneId: PaneId): void
  /** Closed agent sessions per project, newest first. */
  readonly recentSessions: Readonly<Record<ProjectId, readonly RecentSession[]>>
  /** Reopens a closed agent session in a new pane. */
  resumeSession(projectId: ProjectId, sessionId: string): void
  closeFocusedPane(projectId: ProjectId): void
  focusPane(projectId: ProjectId, paneId: PaneId): void
  /** Focuses a pane and puts the keyboard in its terminal, even if it was focused already. */
  revealPane(projectId: ProjectId, paneId: PaneId): void
  /** Bumped by `revealPane`, so a pane that is already focused still takes the keyboard. */
  readonly focusRequests: Readonly<Record<PaneId, number>>
  /** What each agent pane is asking or finished, and since when (for the inbox). */
  readonly details: Readonly<Record<PaneId, PaneDetail>>
  setActivity(
    paneId: PaneId,
    activity: PaneActivity,
    detail?: string | null,
    approvals?: readonly ToolCallPreview[],
  ): void
  /** Each agent pane's subagents, for the Agents list. */
  readonly subagents: Readonly<Record<PaneId, readonly Subagent[]>>
  setSubagents(paneId: PaneId, subagents: readonly Subagent[]): void
  removeProject(projectId: ProjectId): void
  /** Where keyboard focus last was per project, so ⌘W closes a tab or a pane accordingly. */
  readonly focusedAreas: Readonly<Record<ProjectId, FocusArea>>
  setFocusedArea(projectId: ProjectId, area: FocusArea): void
}

export type FocusArea = 'editor' | 'terminal'

export interface PaneDetail {
  readonly detail: string | null
  /** The tool calls waiting for approval, in full, oldest first. */
  readonly approvals: readonly ToolCallPreview[]
  /** Epoch ms when the pane entered its current activity. */
  readonly since: number
}

const createPaneId = () => crypto.randomUUID()
const NO_RECENT: readonly RecentSession[] = []
const NO_APPROVALS: readonly ToolCallPreview[] = []

function withoutKeys<V>(record: Readonly<Record<string, V>>, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => {
  /** Applies a pure layout change; unchanged results leave state alone (no re-render). */
  const updateLayout = (projectId: ProjectId, change: (layout: ProjectLayout) => ProjectLayout) =>
    set((state) => {
      const current = state.layouts[projectId] ?? EMPTY_LAYOUT
      const next = change(current)
      return next === current ? state : { layouts: { ...state.layouts, [projectId]: next } }
    })

  const updateRecent = (
    projectId: ProjectId,
    change: (list: readonly RecentSession[]) => readonly RecentSession[],
  ) =>
    set((state) => {
      const current = state.recentSessions[projectId] ?? NO_RECENT
      const next = change(current)
      return next === current
        ? state
        : { recentSessions: { ...state.recentSessions, [projectId]: next } }
    })

  return {
    focusedAreas: {},
    setFocusedArea: (projectId, area) =>
      set((state) =>
        state.focusedAreas[projectId] === area
          ? state
          : { focusedAreas: { ...state.focusedAreas, [projectId]: area } },
      ),
    layouts: {},
    activities: {},
    gitCheckouts: {},
    setPaneSession: (projectId, paneId, sessionId) =>
      updateLayout(projectId, (layout) => setPaneSession(layout, paneId, sessionId)),
    restartPane: (projectId, paneId, options) =>
      updateLayout(projectId, (layout) => restartPane(layout, paneId, options)),
    hydrate: (snapshot) =>
      set({
        layouts: Object.fromEntries(
          Object.entries(snapshot.projects).map(([projectId, saved]) => {
            const panes = saved.panes.map(({ kind, worktree, sessionId, title }): Pane => ({
              id: createPaneId(),
              kind,
              generation: 0,
              ...(worktree && { worktree }),
              ...(sessionId && { sessionId }),
              ...(title && { title }),
            }))
            return [projectId, { panes, focusedPaneId: panes.at(-1)?.id ?? null }]
          }),
        ),
        recentSessions: Object.fromEntries(
          Object.entries(snapshot.projects).map(([projectId, saved]) => [
            projectId,
            saved.recent ?? NO_RECENT,
          ]),
        ),
      }),
    selectCheckout: (projectId, worktreePath) =>
      set((state) => ({ gitCheckouts: { ...state.gitCheckouts, [projectId]: worktreePath } })),
    closeWorktreePanes: (projectId, worktreePath) => {
      const before = get().layouts[projectId]?.panes ?? []
      const closed = before.filter((pane) => pane.worktree?.path === worktreePath)
      updateLayout(projectId, (layout) => closeWorktreePanes(layout, worktreePath))
      updateRecent(projectId, (list) => forgetWorktreeSessions(list, worktreePath))
      const ids = closed.map((pane) => pane.id)
      set((state) => ({
        activities: withoutKeys(state.activities, ids),
        terminalIds: withoutKeys(state.terminalIds, ids),
        subagents: withoutKeys(state.subagents, ids),
      }))
    },
    terminalIds: {},
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
    clearInitialPrompt: (projectId, paneId) =>
      updateLayout(projectId, (layout) => clearInitialPrompt(layout, paneId)),
    addPane: (projectId, kind, worktree, extras) => {
      updateLayout(projectId, (layout) => addPane(layout, kind, createPaneId, worktree, extras))
      get().selectCheckout(projectId, worktree?.path ?? null)
    },
    closePane: (projectId, paneId) => {
      const pane = get().layouts[projectId]?.panes.find((candidate) => candidate.id === paneId)
      const recent = pane ? toRecentSession(pane, Date.now()) : null
      if (recent) updateRecent(projectId, (list) => rememberSession(list, recent))
      updateLayout(projectId, (layout) => closePane(layout, paneId))
      set((state) => ({
        activities: withoutKeys(state.activities, [paneId]),
        terminalIds: withoutKeys(state.terminalIds, [paneId]),
        subagents: withoutKeys(state.subagents, [paneId]),
      }))
    },
    recentSessions: {},
    resumeSession: (projectId, sessionId) => {
      const recent = get().recentSessions[projectId]?.find((entry) => entry.sessionId === sessionId)
      if (!recent) return
      const before = get().layouts[projectId]
      get().addPane(projectId, recent.kind, recent.worktree, {
        sessionId,
        title: recent.title,
        task: recent.task,
      })
      // A full workspace adds nothing; keep the session on offer then.
      if (get().layouts[projectId] !== before) {
        updateRecent(projectId, (list) => forgetSession(list, sessionId))
      }
    },
    closeFocusedPane: (projectId) => {
      const focused = get().layouts[projectId]?.focusedPaneId
      if (focused) get().closePane(projectId, focused)
    },
    focusPane: (projectId, paneId) => {
      get().setFocusedArea(projectId, 'terminal')
      updateLayout(projectId, (layout) => focusPane(layout, paneId))
      // The git panel follows the focused pane's checkout.
      const pane = get().layouts[projectId]?.panes.find((candidate) => candidate.id === paneId)
      if (pane) get().selectCheckout(projectId, pane.worktree?.path ?? null)
    },
    revealPane: (projectId, paneId) => {
      get().focusPane(projectId, paneId)
      set((state) => ({
        focusRequests: { ...state.focusRequests, [paneId]: (state.focusRequests[paneId] ?? 0) + 1 },
      }))
    },
    focusRequests: {},
    details: {},
    setActivity: (paneId, activity, detail = null, approvals = NO_APPROVALS) =>
      set((state) => {
        const isNewActivity = state.activities[paneId] !== activity
        const current = state.details[paneId]
        const isSame = current?.detail === detail && current.approvals === approvals
        if (!isNewActivity && isSame) return state
        const since = isNewActivity || !current ? Date.now() : current.since
        return {
          activities: isNewActivity
            ? { ...state.activities, [paneId]: activity }
            : state.activities,
          details: { ...state.details, [paneId]: { detail, approvals, since } },
        }
      }),
    subagents: {},
    setSubagents: (paneId, subagents) =>
      set((state) => {
        const current = state.subagents[paneId]
        if (current === subagents || (!current && subagents.length === 0)) return state
        return { subagents: { ...state.subagents, [paneId]: subagents } }
      }),
    removeProject: (projectId) =>
      set((state) => {
        const paneIds = state.layouts[projectId]?.panes.map((pane) => pane.id) ?? []
        return {
          layouts: withoutKeys(state.layouts, [projectId]),
          recentSessions: withoutKeys(state.recentSessions, [projectId]),
          activities: withoutKeys(state.activities, paneIds),
          terminalIds: withoutKeys(state.terminalIds, paneIds),
          subagents: withoutKeys(state.subagents, paneIds),
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

/** A project's closed agent sessions, newest first. */
export function useRecentSessions(projectId: ProjectId): readonly RecentSession[] {
  return useWorkspaceStore((state) => state.recentSessions[projectId] ?? NO_RECENT)
}

/**
 * The persistable part of the workspace: each project's panes, without runtime ids, and the
 * agent sessions closed from it.
 */
export function toSnapshot(
  layouts: Readonly<Record<ProjectId, ProjectLayout>>,
  recentSessions: Readonly<Record<ProjectId, readonly RecentSession[]>> = {},
): WorkspaceSnapshot {
  const projectIds = [...new Set([...Object.keys(layouts), ...Object.keys(recentSessions)])]
  return {
    version: 1,
    projects: Object.fromEntries(
      projectIds.map((projectId) => {
        const panes = layouts[projectId]?.panes ?? []
        const recent = recentSessions[projectId] ?? NO_RECENT
        return [
          projectId,
          {
            panes: panes.map(({ kind, worktree, sessionId, task, title }) => ({
              kind,
              ...(worktree && { worktree }),
              ...(sessionId && { sessionId }),
              ...(task && { task }),
              ...(title && { title }),
            })),
            ...(recent.length > 0 && { recent: [...recent] }),
          },
        ]
      }),
    ),
  }
}
