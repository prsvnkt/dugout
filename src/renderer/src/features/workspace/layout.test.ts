import { describe, expect, test } from 'vitest'
import { addPane, closePane, EMPTY_LAYOUT, focusPane, type ProjectLayout } from './layout'

let nextId = 0
const createId = () => `pane${++nextId}`

function idAt(layout: ProjectLayout, index: number): string {
  const pane = layout.panes[index]
  if (!pane) throw new Error(`No pane at index ${index}`)
  return pane.id
}

describe('workspace layout', () => {
  test('adding a pane appends it and focuses it', () => {
    const one = addPane(EMPTY_LAYOUT, 'claude', createId)
    const two = addPane(one, 'shell', createId)

    expect(two.panes.map((pane) => pane.kind)).toEqual(['claude', 'shell'])
    expect(two.focusedPaneId).toBe(two.panes[1]?.id)
  })

  test('adding never mutates the previous layout', () => {
    const one = addPane(EMPTY_LAYOUT, 'claude', createId)
    addPane(one, 'shell', createId)
    expect(one.panes).toHaveLength(1)
    expect(EMPTY_LAYOUT.panes).toHaveLength(0)
  })

  test('closing the focused pane focuses its neighbour', () => {
    let layout: ProjectLayout = EMPTY_LAYOUT
    layout = addPane(layout, 'claude', createId)
    layout = addPane(layout, 'shell', createId)
    layout = addPane(layout, 'shell', createId)
    const [first, second, third] = [idAt(layout, 0), idAt(layout, 1), idAt(layout, 2)]

    const afterMiddle = closePane(focusPane(layout, second), second)
    expect(afterMiddle.panes.map((p) => p.id)).toEqual([first, third])
    expect(afterMiddle.focusedPaneId).toBe(third)

    const afterLast = closePane(afterMiddle, third)
    expect(afterLast.focusedPaneId).toBe(first)
  })

  test('closing an unfocused pane keeps focus where it was', () => {
    let layout: ProjectLayout = EMPTY_LAYOUT
    layout = addPane(layout, 'claude', createId)
    layout = addPane(layout, 'shell', createId)
    expect(closePane(layout, idAt(layout, 0)).focusedPaneId).toBe(idAt(layout, 1))
  })

  test('closing the last pane leaves nothing focused', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    expect(closePane(layout, idAt(layout, 0))).toEqual(EMPTY_LAYOUT)
  })

  test('focusing an unknown pane is a no-op', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    expect(focusPane(layout, 'missing')).toBe(layout)
  })

  test('caps the number of panes per project', () => {
    let layout: ProjectLayout = EMPTY_LAYOUT
    for (let i = 0; i < 10; i++) layout = addPane(layout, 'shell', createId)
    expect(layout.panes).toHaveLength(6)
  })
})
