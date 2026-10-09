import { describe, expect, test } from 'vitest'
import { arrowTarget } from './arrowNavigation'

const TABS = { orientation: 'horizontal', wrap: true } as const
const TREE = { orientation: 'vertical', wrap: false } as const

describe('arrowTarget', () => {
  test('moves to the next and previous item along the orientation', () => {
    expect(arrowTarget('ArrowRight', 1, 4, TABS)).toBe(2)
    expect(arrowTarget('ArrowLeft', 1, 4, TABS)).toBe(0)
    expect(arrowTarget('ArrowDown', 1, 4, TREE)).toBe(2)
    expect(arrowTarget('ArrowUp', 1, 4, TREE)).toBe(0)
  })

  test('ignores arrows across the orientation and other keys', () => {
    expect(arrowTarget('ArrowDown', 1, 4, TABS)).toBeNull()
    expect(arrowTarget('ArrowRight', 1, 4, TREE)).toBeNull()
    expect(arrowTarget('a', 1, 4, TABS)).toBeNull()
    expect(arrowTarget('Enter', 1, 4, TREE)).toBeNull()
  })

  test('wraps past either end when asked to', () => {
    expect(arrowTarget('ArrowRight', 3, 4, TABS)).toBe(0)
    expect(arrowTarget('ArrowLeft', 0, 4, TABS)).toBe(3)
  })

  test('stops at either end without wrapping', () => {
    expect(arrowTarget('ArrowDown', 3, 4, TREE)).toBe(3)
    expect(arrowTarget('ArrowUp', 0, 4, TREE)).toBe(0)
  })

  test('Home and End go to the first and last item', () => {
    expect(arrowTarget('Home', 2, 4, TABS)).toBe(0)
    expect(arrowTarget('End', 0, 4, TREE)).toBe(3)
  })

  test('with nothing focused, forward picks the first item and backward the last', () => {
    expect(arrowTarget('ArrowDown', -1, 4, TREE)).toBe(0)
    expect(arrowTarget('ArrowUp', -1, 4, TREE)).toBe(3)
  })

  test('returns null when there are no items', () => {
    expect(arrowTarget('ArrowRight', 0, 0, TABS)).toBeNull()
    expect(arrowTarget('Home', -1, 0, TABS)).toBeNull()
  })
})
