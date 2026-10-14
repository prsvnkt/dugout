import type { StoreApi } from 'zustand'
import type { WorkspaceSnapshot } from '@shared/persistence'
import type { ProjectId } from '@shared/project'
import type { TerminalId, TerminalKind } from '@shared/terminal'
import type { PendingToolCall } from '@shared/toolCall'
import type { Worktree } from '@shared/worktree'
import type { Subagent } from '@renderer/features/agents/subagents'
import type { PaneExtras, PaneId, ProjectLayout } from './layout'
import type { PaneActivity } from './paneActivity'
import type { RecentSession } from './recentSessions'

export type FocusArea = 'editor' | 'terminal'

export interface PaneDetail {
  readonly detail: string | null
  /** The tool calls waiting for approval, in full, oldest first. */
  readonly approvals: readonly PendingToolCall[]
  /** Epoch ms when the pane entered its current activity. */
  readonly since: number
}

/** Panes per project and the agent sessions closed from them (paneLayoutSlice). */
export interface PaneLayoutSlice {
  readonly layouts: Readonly<Record<ProjectId, ProjectLayout>>
  /** Closed agent sessions per project, newest first. */
  readonly recentSessions: Readonly<Record<ProjectId, readonly RecentSession[]>>
  /** True once saved panes are back (or could not be read), so the queue sees every agent. */
  readonly isRestored: boolean
  /** Bumped by `revealPane`, so a pane that is already focused still takes the keyboard. */
  readonly focusRequests: Readonly<Record<PaneId, number>>
  /** Replaces all layouts with saved panes (fresh ids), e.g. on launch. */
  hydrate(snapshot: WorkspaceSnapshot): void
  markRestored(): void
  addPane(projectId: ProjectId, kind: TerminalKind, worktree?: Worktree, extras?: PaneExtras): void
  /** Called once the pane's session started, so its first prompt is never sent again. */
  clearInitialPrompt(projectId: ProjectId, paneId: PaneId): void
  setPaneSession(projectId: ProjectId, paneId: PaneId, sessionId: string): void
  restartPane(projectId: ProjectId, paneId: PaneId, options?: { isFresh?: boolean }): void
  /** Closes a pane; an agent's session is remembered so the start screen can resume it. */
  closePane(projectId: ProjectId, paneId: PaneId): void
  closeFocusedPane(projectId: ProjectId): void
  closeWorktreePanes(projectId: ProjectId, worktreePath: string): void
  /** Reopens a closed agent session in a new pane. */
  resumeSession(projectId: ProjectId, sessionId: string): void
  focusPane(projectId: ProjectId, paneId: PaneId): void
  /** Focuses a pane and puts the keyboard in its terminal, even if it was focused already. */
  revealPane(projectId: ProjectId, paneId: PaneId): void
  removeProject(projectId: ProjectId): void
}

/** What each pane is running and doing, and per-project UI focus (paneRuntimeSlice). */
export interface PaneRuntimeSlice {
  readonly activities: Readonly<Record<PaneId, PaneActivity>>
  readonly terminalIds: Readonly<Record<PaneId, TerminalId>>
  /** What each agent pane is asking or finished, and since when (for the inbox). */
  readonly details: Readonly<Record<PaneId, PaneDetail>>
  /** Each agent pane's subagents, for the Agents list. */
  readonly subagents: Readonly<Record<PaneId, readonly Subagent[]>>
  /** Which checkout the git panel shows per project: a worktree path, or null for main. */
  readonly gitCheckouts: Readonly<Record<ProjectId, string | null>>
  /** Where keyboard focus last was per project, so ⌘W closes a tab or a pane accordingly. */
  readonly focusedAreas: Readonly<Record<ProjectId, FocusArea>>
  setTerminalId(paneId: PaneId, terminalId: TerminalId | null): void
  /** Finds the pane running a terminal, e.g. to reveal it from a notification. */
  findTerminal(terminalId: TerminalId): { projectId: ProjectId; paneId: PaneId } | null
  setActivity(
    paneId: PaneId,
    activity: PaneActivity,
    detail?: string | null,
    approvals?: readonly PendingToolCall[],
  ): void
  setSubagents(paneId: PaneId, subagents: readonly Subagent[]): void
  selectCheckout(projectId: ProjectId, worktreePath: string | null): void
  setFocusedArea(projectId: ProjectId, area: FocusArea): void
}

export type WorkspaceState = PaneLayoutSlice & PaneRuntimeSlice

export type WorkspaceSet = StoreApi<WorkspaceState>['setState']
export type WorkspaceGet = StoreApi<WorkspaceState>['getState']

export const NO_RECENT: readonly RecentSession[] = []

export function withoutKeys<V>(record: Readonly<Record<string, V>>, keys: readonly string[]) {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

/** Every per-pane map without `paneIds`, for panes that closed or went with their project. */
export function withoutPanes(state: WorkspaceState, paneIds: readonly PaneId[]) {
  return {
    activities: withoutKeys(state.activities, paneIds),
    terminalIds: withoutKeys(state.terminalIds, paneIds),
    subagents: withoutKeys(state.subagents, paneIds),
    details: withoutKeys(state.details, paneIds),
    focusRequests: withoutKeys(state.focusRequests, paneIds),
  }
}
