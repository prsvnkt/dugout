import { describe, expect, test } from 'vitest'
import {
  IN_REVIEW_LABEL,
  linearStatusTarget,
  priorityFromLinear,
  priorityToLinear,
  statusOfLinear,
  type LinearWorkflowState,
} from './linearMapping'

const state = (id: string, name: string, type: string, position: number): LinearWorkflowState => ({
  id,
  name,
  type,
  position,
})

const DEFAULT_STATES = [
  state('triage', 'Triage', 'triage', 0),
  state('backlog', 'Backlog', 'backlog', 0),
  state('todo', 'Todo', 'unstarted', 1),
  state('doing', 'In Progress', 'started', 2),
  state('done', 'Done', 'completed', 3),
  state('canceled', 'Canceled', 'canceled', 4),
]
const WITH_REVIEW = [...DEFAULT_STATES, state('review', 'In Review', 'started', 3)]

describe('Linear status mapping', () => {
  test('reads Dugout statuses from the state type', () => {
    expect(statusOfLinear({ name: 'Triage', type: 'triage' }, [])).toBe('todo')
    expect(statusOfLinear({ name: 'Backlog', type: 'backlog' }, [])).toBe('todo')
    expect(statusOfLinear({ name: 'Todo', type: 'unstarted' }, [])).toBe('todo')
    expect(statusOfLinear({ name: 'In Progress', type: 'started' }, [])).toBe('in-progress')
    expect(statusOfLinear({ name: 'Done', type: 'completed' }, [])).toBe('done')
    expect(statusOfLinear({ name: 'Canceled', type: 'canceled' }, [])).toBe('done')
    expect(statusOfLinear({ name: 'Duplicate', type: 'duplicate' }, [])).toBe('done')
  })

  test('a started state named like review, or the in-review label, reads as in review', () => {
    expect(statusOfLinear({ name: 'Code review', type: 'started' }, [])).toBe('in-review')
    expect(statusOfLinear({ name: 'In Progress', type: 'started' }, [IN_REVIEW_LABEL])).toBe(
      'in-review',
    )
    // The label only counts while the issue is started.
    expect(statusOfLinear({ name: 'Done', type: 'completed' }, [IN_REVIEW_LABEL])).toBe('done')
  })

  test('moves to the first state of the matching type, by position', () => {
    const shuffled = [...WITH_REVIEW].reverse()
    expect(linearStatusTarget(shuffled, 'todo')).toEqual({
      stateId: 'todo',
      needsReviewLabel: false,
    })
    expect(linearStatusTarget(shuffled, 'in-progress')).toEqual({
      stateId: 'doing',
      needsReviewLabel: false,
    })
    expect(linearStatusTarget(shuffled, 'done')).toEqual({
      stateId: 'done',
      needsReviewLabel: false,
    })
  })

  test('in review prefers a review state', () => {
    expect(linearStatusTarget(WITH_REVIEW, 'in-review')).toEqual({
      stateId: 'review',
      needsReviewLabel: false,
    })
  })

  test('without a review state, in review is the working state plus the label', () => {
    expect(linearStatusTarget(DEFAULT_STATES, 'in-review')).toEqual({
      stateId: 'doing',
      needsReviewLabel: true,
    })
  })

  test('to do falls back to the backlog when the team has no unstarted state', () => {
    const states = DEFAULT_STATES.filter((candidate) => candidate.type !== 'unstarted')
    expect(linearStatusTarget(states, 'todo').stateId).toBe('backlog')
  })

  test('explains a team without a state for the status', () => {
    const states = DEFAULT_STATES.filter((candidate) => candidate.type !== 'completed')
    expect(() => linearStatusTarget(states, 'done')).toThrow('no workflow state for "done"')
  })
})

describe('Linear priority mapping', () => {
  test('reads urgent and high as high, and no priority as none', () => {
    expect([0, 1, 2, 3, 4].map(priorityFromLinear)).toEqual([null, 'high', 'high', 'medium', 'low'])
  })

  test('writes Dugout priorities as Linear numbers', () => {
    expect(priorityToLinear('high')).toBe(2)
    expect(priorityToLinear('medium')).toBe(3)
    expect(priorityToLinear('low')).toBe(4)
    expect(priorityToLinear(null)).toBe(0)
  })
})
