import { describe, expect, test } from 'vitest'
import {
  isSameRange,
  renderedIndices,
  scrollTopToReveal,
  totalHeight,
  windowRange,
} from './virtualRows'

const ROW = 24

describe('windowRange', () => {
  test('covers the rows on screen plus the overscan on each side', () => {
    // Arrange: rows 10–19 are on screen (240px from 240px down)
    const viewport = { scrollTop: 240, height: 240 }

    // Act
    const range = windowRange(viewport, ROW, 1_000, 5)

    // Assert
    expect(range).toEqual({ start: 5, end: 25 })
  })

  test('counts a partly shown row at either edge as on screen', () => {
    expect(windowRange({ scrollTop: 250, height: 240 }, ROW, 1_000, 0)).toEqual({
      start: 10,
      end: 21,
    })
  })

  test('clamps the overscan to the first and last row', () => {
    expect(windowRange({ scrollTop: 0, height: 240 }, ROW, 1_000, 5)).toEqual({ start: 0, end: 15 })
    expect(windowRange({ scrollTop: 23_760, height: 240 }, ROW, 1_000, 5)).toEqual({
      start: 985,
      end: 1_000,
    })
  })

  test('a list shorter than the viewport renders every row', () => {
    expect(windowRange({ scrollTop: 0, height: 600 }, ROW, 3, 5)).toEqual({ start: 0, end: 3 })
  })

  test('an empty list, or a scroll past the end after rows went away, renders nothing', () => {
    expect(windowRange({ scrollTop: 0, height: 240 }, ROW, 0, 5)).toEqual({ start: 0, end: 0 })
    expect(windowRange({ scrollTop: 24_000, height: 240 }, ROW, 10, 5)).toEqual({
      start: 10,
      end: 10,
    })
  })

  test('before the viewport is measured, only the overscan renders', () => {
    expect(windowRange({ scrollTop: 0, height: 0 }, ROW, 1_000, 5)).toEqual({ start: 0, end: 5 })
  })
})

describe('totalHeight', () => {
  test('is every row at the fixed height', () => {
    expect(totalHeight(5_000, ROW)).toBe(120_000)
    expect(totalHeight(0, ROW)).toBe(0)
  })
})

describe('scrollTopToReveal', () => {
  const viewport = { scrollTop: 240, height: 240 }

  test('a row already fully on screen needs no scroll', () => {
    expect(scrollTopToReveal(10, viewport, ROW)).toBeNull()
    expect(scrollTopToReveal(19, viewport, ROW)).toBeNull()
  })

  test('a row above the screen scrolls to its top edge', () => {
    expect(scrollTopToReveal(3, viewport, ROW)).toBe(72)
  })

  test('a row below the screen scrolls just far enough to show its bottom edge', () => {
    expect(scrollTopToReveal(20, viewport, ROW)).toBe(264)
    expect(scrollTopToReveal(999, viewport, ROW)).toBe(23_760)
  })

  test('a partly hidden row is revealed in full', () => {
    expect(scrollTopToReveal(10, { scrollTop: 250, height: 240 }, ROW)).toBe(240)
  })
})

describe('isSameRange', () => {
  test('compares start and end', () => {
    expect(isSameRange({ start: 1, end: 5 }, { start: 1, end: 5 })).toBe(true)
    expect(isSameRange({ start: 1, end: 5 }, { start: 1, end: 6 })).toBe(false)
  })
})

describe('renderedIndices', () => {
  test('lists the window in order', () => {
    expect(renderedIndices({ start: 3, end: 6 }, null)).toEqual([3, 4, 5])
  })

  test('keeps a pinned row outside the window, in screen order', () => {
    expect(renderedIndices({ start: 3, end: 6 }, 0)).toEqual([0, 3, 4, 5])
    expect(renderedIndices({ start: 3, end: 6 }, 40)).toEqual([3, 4, 5, 40])
  })

  test('does not repeat a pinned row inside the window, and ignores a missing one', () => {
    expect(renderedIndices({ start: 3, end: 6 }, 4)).toEqual([3, 4, 5])
    expect(renderedIndices({ start: 3, end: 6 }, -1)).toEqual([3, 4, 5])
  })
})
