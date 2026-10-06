import type { TerminalKind } from '@shared/terminal'
import type { Worktree } from '@shared/worktree'

export type PaneId = string

export interface Pane {
  readonly id: PaneId
  readonly kind: TerminalKind
  /** Set when the pane runs in an isolated worktree instead of the main checkout. */
  readonly worktree?: Worktree
  /** Latest Claude session id, used to resume the conversation after a restart. */
  readonly sessionId?: string
  /** Bumped to restart the pane's process (the pane remounts with a new key). */
  readonly generation: number
  /** The task this agent was started for. */
  readonly task?: PaneTask
  /** First message for a new Claude session; cleared once the session has started. */
  readonly initialPrompt?: string
}

export interface PaneTask {
  readonly number: number
  readonly title: string
}

export interface PaneExtras {
  readonly task?: PaneTask | undefined
  readonly initialPrompt?: string | undefined
}

/** The side-by-side terminal panes of one project. */
export interface ProjectLayout {
  readonly panes: readonly Pane[]
  readonly focusedPaneId: PaneId | null
}

/** More panes than this side by side become too narrow to be useful. */
export const MAX_PANES_PER_PROJECT = 6

export const EMPTY_LAYOUT: ProjectLayout = { panes: [], focusedPaneId: null }

export function addPane(
  layout: ProjectLayout,
  kind: TerminalKind,
  createId: () => PaneId,
  worktree?: Worktree,
  extras: PaneExtras = {},
): ProjectLayout {
  if (layout.panes.length >= MAX_PANES_PER_PROJECT) return layout
  const pane: Pane = {
    id: createId(),
    kind,
    generation: 0,
    ...(worktree && { worktree }),
    ...(extras.task && { task: extras.task }),
    ...(extras.initialPrompt && { initialPrompt: extras.initialPrompt }),
  }
  return { panes: [...layout.panes, pane], focusedPaneId: pane.id }
}

export function closePane(layout: ProjectLayout, paneId: PaneId): ProjectLayout {
  const index = layout.panes.findIndex((pane) => pane.id === paneId)
  if (index === -1) return layout

  const panes = layout.panes.filter((pane) => pane.id !== paneId)
  if (panes.length === 0) return EMPTY_LAYOUT
  if (layout.focusedPaneId !== paneId) return { ...layout, panes }

  const neighbour = panes[Math.min(index, panes.length - 1)]
  return { panes, focusedPaneId: neighbour?.id ?? null }
}

export function focusPane(layout: ProjectLayout, paneId: PaneId): ProjectLayout {
  const exists = layout.panes.some((pane) => pane.id === paneId)
  if (!exists || layout.focusedPaneId === paneId) return layout
  return { ...layout, focusedPaneId: paneId }
}

/** Closes every pane running in the worktree at `path`, e.g. before removing it. */
export function closeWorktreePanes(layout: ProjectLayout, path: string): ProjectLayout {
  return layout.panes
    .filter((pane) => pane.worktree?.path === path)
    .reduce((current, pane) => closePane(current, pane.id), layout)
}

function updatePane(layout: ProjectLayout, paneId: PaneId, change: (pane: Pane) => Pane) {
  return {
    ...layout,
    panes: layout.panes.map((pane) => (pane.id === paneId ? change(pane) : pane)),
  }
}

export function setPaneSession(layout: ProjectLayout, paneId: PaneId, sessionId: string) {
  const pane = layout.panes.find((candidate) => candidate.id === paneId)
  if (!pane || pane.sessionId === sessionId) return layout
  return updatePane(layout, paneId, (current) => ({ ...current, sessionId }))
}

/** Restarts a pane's process. `isFresh` drops its session, starting a new conversation. */
export function restartPane(
  layout: ProjectLayout,
  paneId: PaneId,
  { isFresh = false }: { readonly isFresh?: boolean } = {},
): ProjectLayout {
  return updatePane(layout, paneId, ({ sessionId, ...pane }) => ({
    ...pane,
    generation: pane.generation + 1,
    ...(!isFresh && sessionId !== undefined && { sessionId }),
  }))
}

/** The first prompt is sent once; restarts resume the session instead. */
export function clearInitialPrompt(layout: ProjectLayout, paneId: PaneId): ProjectLayout {
  const pane = layout.panes.find((candidate) => candidate.id === paneId)
  if (!pane?.initialPrompt) return layout
  return updatePane(layout, paneId, ({ initialPrompt, ...rest }) => rest)
}
