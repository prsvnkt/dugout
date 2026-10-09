import { describe, expect, test } from 'vitest'
import {
  applyQueueChange,
  DEFAULT_MAX_AGENTS,
  MAX_QUEUED_TASKS,
  maxAgentsOf,
  type QueuedTask,
} from './taskQueue'

const task = (number: number): QueuedTask => ({
  number,
  key: `#${number}`,
  title: `Task ${number}`,
  agent: 'claude',
})

const numbers = (queue: readonly QueuedTask[]) => queue.map((entry) => entry.number)

describe('applyQueueChange', () => {
  test('adds a task at the end of the queue', () => {
    // Arrange
    const queue = [task(1)]

    // Act
    const next = applyQueueChange(queue, { kind: 'add', task: task(2) })

    // Assert
    expect(numbers(next)).toEqual([1, 2])
    expect(numbers(queue)).toEqual([1])
  })

  test('keeps a task queued once, with its latest agent choice', () => {
    const queue = [task(1), task(2)]

    const next = applyQueueChange(queue, { kind: 'add', task: { ...task(1), agent: 'codex' } })

    expect(next).toEqual([{ ...task(1), agent: 'codex' }, task(2)])
  })

  test('refuses to grow past the most tasks a queue holds', () => {
    const queue = Array.from({ length: MAX_QUEUED_TASKS }, (_, index) => task(index + 1))

    expect(() =>
      applyQueueChange(queue, { kind: 'add', task: task(MAX_QUEUED_TASKS + 1) }),
    ).toThrow(`at most ${MAX_QUEUED_TASKS}`)
  })

  test('removes a task', () => {
    const next = applyQueueChange([task(1), task(2), task(3)], { kind: 'remove', number: 2 })

    expect(numbers(next)).toEqual([1, 3])
  })

  test('returns the same queue when removing a task that is not queued', () => {
    const queue = [task(1)]

    expect(applyQueueChange(queue, { kind: 'remove', number: 9 })).toBe(queue)
  })

  test('moves a task up and down', () => {
    const queue = [task(1), task(2), task(3)]

    expect(numbers(applyQueueChange(queue, { kind: 'move', number: 3, offset: -1 }))).toEqual([
      1, 3, 2,
    ])
    expect(numbers(applyQueueChange(queue, { kind: 'move', number: 1, offset: 1 }))).toEqual([
      2, 1, 3,
    ])
  })

  test('returns the same queue when a move would leave the ends', () => {
    const queue = [task(1), task(2)]

    expect(applyQueueChange(queue, { kind: 'move', number: 1, offset: -1 })).toBe(queue)
    expect(applyQueueChange(queue, { kind: 'move', number: 2, offset: 1 })).toBe(queue)
    expect(applyQueueChange(queue, { kind: 'move', number: 7, offset: 1 })).toBe(queue)
  })
})

describe('maxAgentsOf', () => {
  test('uses the default when the project has no limit set', () => {
    expect(maxAgentsOf({})).toBe(DEFAULT_MAX_AGENTS)
  })

  test("uses the project's own limit", () => {
    expect(maxAgentsOf({ maxAgents: 1 })).toBe(1)
  })
})
