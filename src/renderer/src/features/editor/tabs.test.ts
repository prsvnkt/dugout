import { describe, expect, test } from 'vitest'
import { closeTab, EMPTY_TABS, openTab, pinTab, type EditorTab, type TabsState } from './tabs'

const file = (path: string): Omit<EditorTab, 'isPreview'> => ({
  id: `file:${path}`,
  kind: 'file',
  path,
  staged: false,
  worktreePath: null,
})

describe('editor tabs', () => {
  test('opening a file adds and activates a tab', () => {
    const state = openTab(EMPTY_TABS, file('a.ts'), { isPreview: false })
    expect(state.tabs.map((tab) => tab.path)).toEqual(['a.ts'])
    expect(state.activeTabId).toBe('file:a.ts')
  })

  test('a preview tab is replaced by the next preview, in place', () => {
    let state: TabsState = openTab(EMPTY_TABS, file('pinned.ts'), { isPreview: false })
    state = openTab(state, file('a.ts'), { isPreview: true })
    state = openTab(state, file('b.ts'), { isPreview: true })
    expect(state.tabs.map((tab) => tab.path)).toEqual(['pinned.ts', 'b.ts'])
    expect(state.tabs[1]?.isPreview).toBe(true)
  })

  test('re-opening a tab activates it, and opening it pinned pins it', () => {
    let state: TabsState = openTab(EMPTY_TABS, file('a.ts'), { isPreview: true })
    state = openTab(state, file('b.ts'), { isPreview: false })
    state = openTab(state, file('a.ts'), { isPreview: false })
    expect(state.activeTabId).toBe('file:a.ts')
    expect(state.tabs.find((tab) => tab.id === 'file:a.ts')?.isPreview).toBe(false)
  })

  test('re-opening as a preview never un-pins a tab', () => {
    let state: TabsState = openTab(EMPTY_TABS, file('a.ts'), { isPreview: false })
    state = openTab(state, file('a.ts'), { isPreview: true })
    expect(state.tabs[0]?.isPreview).toBe(false)
  })

  test('pinning keeps a preview tab when the next file opens', () => {
    let state: TabsState = openTab(EMPTY_TABS, file('a.ts'), { isPreview: true })
    state = pinTab(state, 'file:a.ts')
    state = openTab(state, file('b.ts'), { isPreview: true })
    expect(state.tabs.map((tab) => tab.path)).toEqual(['a.ts', 'b.ts'])
  })

  test('closing the active tab activates its neighbour', () => {
    let state: TabsState = EMPTY_TABS
    for (const path of ['a.ts', 'b.ts', 'c.ts']) {
      state = openTab(state, file(path), { isPreview: false })
    }
    state = openTab(state, file('b.ts'), { isPreview: false })

    const afterB = closeTab(state, 'file:b.ts')
    expect(afterB.activeTabId).toBe('file:c.ts')
    expect(closeTab(afterB, 'file:c.ts').activeTabId).toBe('file:a.ts')
    expect(closeTab(closeTab(afterB, 'file:c.ts'), 'file:a.ts')).toEqual(EMPTY_TABS)
  })

  test('never mutates the previous state', () => {
    const before = openTab(EMPTY_TABS, file('a.ts'), { isPreview: false })
    openTab(before, file('b.ts'), { isPreview: false })
    expect(before.tabs).toHaveLength(1)
  })
})
