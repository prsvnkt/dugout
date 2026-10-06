import { describe, expect, it } from 'vitest'
import { togglePanelView } from './rightPanel'

describe('togglePanelView', () => {
  it('hides the panel when it already shows the view', () => {
    const state = { isPanelOpen: true, panelView: 'review' as const }

    expect(togglePanelView(state, 'review')).toEqual({ isPanelOpen: false, panelView: 'review' })
  })

  it('switches views without closing an open panel', () => {
    const state = { isPanelOpen: true, panelView: 'review' as const }

    expect(togglePanelView(state, 'tasks')).toEqual({ isPanelOpen: true, panelView: 'tasks' })
  })

  it('opens a hidden panel on the requested view', () => {
    const state = { isPanelOpen: false, panelView: 'review' as const }

    expect(togglePanelView(state, 'tasks')).toEqual({ isPanelOpen: true, panelView: 'tasks' })
  })

  it('does not mutate the given state', () => {
    const state = Object.freeze({ isPanelOpen: true, panelView: 'review' as const })

    expect(() => togglePanelView(state, 'review')).not.toThrow()
    expect(state.isPanelOpen).toBe(true)
  })
})
