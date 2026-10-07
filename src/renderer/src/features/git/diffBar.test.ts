import { describe, expect, test } from 'vitest'
import { BAR_MAX_PX, diffBar } from './diffBar'

describe('diffBar', () => {
  test('splits the filled width between additions and deletions', () => {
    const bar = diffBar({ kind: 'text', additions: 30, deletions: 10 })

    expect(bar.added + bar.removed).toBeLessThanOrEqual(BAR_MAX_PX)
    expect(bar.added).toBeGreaterThan(bar.removed * 2)
    expect(bar.removed).toBeGreaterThan(0)
  })

  test('grows with the size of the change, up to the cap', () => {
    const small = diffBar({ kind: 'text', additions: 2, deletions: 0 })
    const medium = diffBar({ kind: 'text', additions: 80, deletions: 0 })
    const huge = diffBar({ kind: 'text', additions: 50_000, deletions: 0 })

    expect(small.added).toBeLessThan(medium.added)
    expect(huge.added).toBe(BAR_MAX_PX)
  })

  test('never exceeds the cap, even with a tiny share on one side', () => {
    const bar = diffBar({ kind: 'text', additions: 1, deletions: 5_000 })

    expect(bar.added).toBeGreaterThanOrEqual(2)
    expect(bar.added + bar.removed).toBe(BAR_MAX_PX)
  })

  test('keeps a one-line change visible', () => {
    expect(diffBar({ kind: 'text', additions: 0, deletions: 1 }).removed).toBeGreaterThanOrEqual(2)
  })

  test('is empty for binary files and changes without lines', () => {
    expect(diffBar({ kind: 'binary' })).toEqual({ added: 0, removed: 0 })
    expect(diffBar({ kind: 'text', additions: 0, deletions: 0 })).toEqual({ added: 0, removed: 0 })
  })
})
