import { beforeEach, describe, expect, test } from 'vitest'
import { useViewerModeStore } from './viewerModeStore'

const initial = useViewerModeStore.getState()

beforeEach(() => useViewerModeStore.setState(initial, true))

describe('useViewerModeStore', () => {
  test('remembers a file switched to its source', () => {
    useViewerModeStore.getState().setMode('p::::README.md', 'source')

    expect(useViewerModeStore.getState().modes).toEqual({ 'p::::README.md': 'source' })
  })

  test('changes nothing when the mode is already shown (preview by default)', () => {
    const before = useViewerModeStore.getState()

    before.setMode('p::::README.md', 'preview')

    expect(useViewerModeStore.getState()).toBe(before)
  })
})
