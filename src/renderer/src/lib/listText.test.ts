import { describe, expect, test } from 'vitest'
import { listText } from './listText'

describe('listText', () => {
  test('joins names as a sentence would', () => {
    expect(listText([])).toBe('')
    expect(listText(['A'])).toBe('A')
    expect(listText(['A', 'B'])).toBe('A and B')
    expect(listText(['A', 'B', 'C'])).toBe('A, B and C')
  })
})
