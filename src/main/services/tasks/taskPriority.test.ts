import { describe, expect, test } from 'vitest'
import { labelsForPriority, priorityOf, priorityRank } from './taskPriority'

describe('task priority labels', () => {
  test('reads the priority from its label', () => {
    expect(priorityOf(['bug', 'dugout:priority-medium'])).toBe('medium')
    expect(priorityOf(['bug'])).toBeNull()
  })

  test('replaces any priority label, keeping the others', () => {
    expect(labelsForPriority(['bug', 'dugout:priority-low'], 'high')).toEqual([
      'bug',
      'dugout:priority-high',
    ])
  })

  test('null removes the priority', () => {
    expect(labelsForPriority(['dugout:priority-low', 'ui'], null)).toEqual(['ui'])
  })

  test('ranks high first and no priority last', () => {
    const ranks = (['low', null, 'high', 'medium'] as const).map(priorityRank)
    expect(ranks).toEqual([2, 3, 0, 1])
  })
})
