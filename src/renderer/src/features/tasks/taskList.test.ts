import { describe, expect, it } from 'vitest'
import type { Task, TaskStatus } from '@shared/tasks'
import { DONE_SHOWN, filterTasks, groupTasks, priorityOf, visibleLabels } from './taskList'

function task(number: number, status: TaskStatus, title = `Task ${number}`): Task {
  return {
    number,
    title,
    body: '',
    status,
    url: `https://github.com/o/r/issues/${number}`,
    author: 'octocat',
    labels: [],
    commentCount: 0,
    updatedAt: '2026-10-01T00:00:00Z',
  }
}

describe('filterTasks', () => {
  const tasks = [task(1, 'todo', 'Fix login'), task(12, 'todo', 'Add dark mode')]

  it('returns every task for a blank query', () => {
    expect(filterTasks(tasks, '  ')).toBe(tasks)
  })

  it('matches titles case-insensitively', () => {
    expect(filterTasks(tasks, 'LOGIN').map((t) => t.number)).toEqual([1])
  })

  it('matches a number with or without "#"', () => {
    expect(filterTasks(tasks, '#12').map((t) => t.number)).toEqual([12])
    expect(filterTasks(tasks, '1').map((t) => t.number)).toEqual([1])
  })
})

describe('groupTasks', () => {
  it('orders groups by status and drops empty ones', () => {
    const groups = groupTasks([task(1, 'todo'), task(2, 'in-progress'), task(3, 'todo')])
    expect(groups.map((g) => [g.status, g.tasks.map((t) => t.number)])).toEqual([
      ['in-progress', [2]],
      ['todo', [1, 3]],
    ])
  })

  it('caps the Done group', () => {
    const done = Array.from({ length: DONE_SHOWN + 5 }, (_, i) => task(i + 1, 'done'))
    expect(groupTasks(done)[0]?.tasks).toHaveLength(DONE_SHOWN)
  })
})

describe('labels', () => {
  it('hides Dugout’s own labels', () => {
    expect(visibleLabels(['bug', 'dugout:in-progress', 'dugout:priority-high', 'ui'])).toEqual([
      'bug',
      'ui',
    ])
  })

  it('reads the priority label', () => {
    expect(priorityOf(['bug', 'dugout:priority-medium'])).toBe('medium')
    expect(priorityOf(['bug'])).toBeNull()
  })
})
