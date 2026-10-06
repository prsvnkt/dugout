import { describe, expect, test } from 'vitest'
import { labelsForStatus, statusOf, STATUS_LABELS } from './taskStatus'

describe('statusOf', () => {
  test('closed issues are done, whatever their labels', () => {
    expect(statusOf('closed', [STATUS_LABELS['in-progress']])).toBe('done')
  })

  test('open issues follow the Dugout status label', () => {
    expect(statusOf('open', ['bug'])).toBe('todo')
    expect(statusOf('open', ['bug', 'dugout:in-progress'])).toBe('in-progress')
    expect(statusOf('open', ['dugout:in-review'])).toBe('in-review')
  })

  test('review wins when both labels are present', () => {
    expect(statusOf('open', ['dugout:in-progress', 'dugout:in-review'])).toBe('in-review')
  })
})

describe('labelsForStatus', () => {
  test('swaps the Dugout label and keeps the others', () => {
    expect(labelsForStatus(['bug', 'dugout:in-progress'], 'in-review')).toEqual({
      state: 'open',
      labels: ['bug', 'dugout:in-review'],
    })
  })

  test('to do removes Dugout labels', () => {
    expect(labelsForStatus(['dugout:in-review', 'p1'], 'todo')).toEqual({
      state: 'open',
      labels: ['p1'],
    })
  })

  test('done closes the issue and clears Dugout labels', () => {
    expect(labelsForStatus(['dugout:in-progress', 'p1'], 'done')).toEqual({
      state: 'closed',
      labels: ['p1'],
    })
  })
})
