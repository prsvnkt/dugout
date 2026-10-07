import { describe, expect, test } from 'vitest'
import { formatAge } from './formatAge'

const NOW = new Date('2026-10-07T12:00:00Z').getTime()

describe('formatAge', () => {
  test.each([
    ['2026-10-07T11:59:40Z', 'just now'],
    ['2026-10-07T11:52:00Z', '8 minutes ago'],
    ['2026-10-07T09:00:00Z', '3 hours ago'],
    ['2026-10-06T12:00:00Z', 'yesterday'],
    ['2026-09-07T12:00:00Z', 'last month'],
    ['2024-10-07T12:00:00Z', '2 years ago'],
  ])('%s is "%s"', (date, expected) => {
    expect(formatAge(date, NOW)).toBe(expected)
  })

  test('returns an empty string for an unreadable date', () => {
    expect(formatAge('not a date', NOW)).toBe('')
  })
})
