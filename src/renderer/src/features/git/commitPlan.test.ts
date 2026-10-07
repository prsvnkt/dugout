import { describe, expect, test } from 'vitest'
import { commitPlan } from './commitPlan'

describe('commitPlan', () => {
  test('commits only what is staged when something is staged', () => {
    expect(commitPlan({ stagedCount: 2, unstagedCount: 5, message: 'fix: x' })).toEqual({
      canCommit: true,
      includeAll: false,
      label: 'Commit',
      description: 'Commit 2 staged',
    })
  })

  test('commits every change when nothing is staged (smart commit)', () => {
    expect(commitPlan({ stagedCount: 0, unstagedCount: 3, message: 'fix: x' })).toEqual({
      canCommit: true,
      includeAll: true,
      label: 'Commit all',
      description: 'Commit all 3 changes',
    })
  })

  test('cannot commit without a message', () => {
    expect(commitPlan({ stagedCount: 1, unstagedCount: 0, message: '   ' }).canCommit).toBe(false)
  })

  test('cannot commit a clean tree', () => {
    expect(commitPlan({ stagedCount: 0, unstagedCount: 0, message: 'x' })).toMatchObject({
      canCommit: false,
      description: 'Nothing to commit',
    })
  })
})
