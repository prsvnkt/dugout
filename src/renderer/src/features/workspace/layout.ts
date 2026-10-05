import type { TerminalKind } from '@shared/terminal'

export type PaneId = string

export interface Pane {
  readonly id: PaneId
  readonly kind: TerminalKind
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
): ProjectLayout {
  if (layout.panes.length >= MAX_PANES_PER_PROJECT) return layout
  const pane: Pane = { id: createId(), kind }
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
