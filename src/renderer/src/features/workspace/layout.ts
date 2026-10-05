import type { TerminalKind } from '@shared/terminal'
import type { Worktree } from '@shared/worktree'

export type PaneId = string

export interface Pane {
  readonly id: PaneId
  readonly kind: TerminalKind
  /** Set when the pane runs in an isolated worktree instead of the main checkout. */
  readonly worktree?: Worktree
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
): ProjectLayout {
  if (layout.panes.length >= MAX_PANES_PER_PROJECT) return layout
  const pane: Pane = { id: createId(), kind, ...(worktree && { worktree }) }
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
