/** What the right side panel shows: the git review, or the project's tasks. */
export type RightPanelView = 'review' | 'tasks'

export interface RightPanelState {
  readonly isPanelOpen: boolean
  readonly panelView: RightPanelView
}

/**
 * An activity rail button: shows `view`, or hides the panel when it already shows it.
 */
export function togglePanelView<T extends RightPanelState>(state: T, view: RightPanelView): T {
  if (state.isPanelOpen && state.panelView === view) return { ...state, isPanelOpen: false }
  return { ...state, isPanelOpen: true, panelView: view }
}
