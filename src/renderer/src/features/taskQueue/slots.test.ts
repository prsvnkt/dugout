import { describe, expect, test } from 'vitest'
import type { QueuedTask } from '@shared/taskQueue'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'
import {
  busySlots,
  settleLaunches,
  slotAgentsOf,
  tasksToStart,
  type Launch,
  type SlotAgent,
} from './slots'

const agent = (activity: PaneActivity | null, taskNumber: number | null = null): SlotAgent => ({
  activity,
  taskNumber,
})
const queued = (number: number): QueuedTask => ({
  number,
  key: `#${number}`,
  title: `Task ${number}`,
  agent: 'claude',
})

describe('slotAgentsOf', () => {
  test('lists agents with their activity and task, leaving out shells', () => {
    const panes = [
      { id: 'a', kind: 'claude' as const, task: { number: 4, title: 'Fix login' } },
      { id: 'b', kind: 'shell' as const },
      { id: 'c', kind: 'codex' as const },
    ]

    const agents = slotAgentsOf(panes, { a: 'working', b: 'running' })

    expect(agents).toEqual([agent('working', 4), agent(null)])
  })
})

describe('busySlots', () => {
  test.each<PaneActivity | null>([null, 'starting', 'running', 'working', 'needs-input'])(
    'counts an agent that is %s',
    (activity) => {
      expect(busySlots([agent(activity)], [])).toBe(1)
    },
  )

  test.each<PaneActivity>(['idle', 'done', 'exited', 'error'])(
    'frees the slot of an agent that is %s',
    (activity) => {
      expect(busySlots([agent(activity)], [])).toBe(0)
    },
  )

  test('counts a task agent that is still at Ready right after it started', () => {
    // Arrange
    const launches: Launch[] = [{ number: 4, phase: 'started' }]

    // Act
    const busy = busySlots([agent('idle', 4), agent('idle', 5)], launches)

    // Assert
    expect(busy).toBe(1)
  })

  test('counts a start that has no agent yet', () => {
    expect(busySlots([], [{ number: 4, phase: 'requesting' }])).toBe(1)
  })
})

describe('settleLaunches', () => {
  test('keeps a start until its agent has done something', () => {
    const launches: Launch[] = [{ number: 4, phase: 'started' }]

    expect(settleLaunches(launches, [agent('idle', 4)])).toBe(launches)
    expect(settleLaunches(launches, [agent('starting', 4)])).toBe(launches)
    // Running before its first status from hooks
    expect(settleLaunches(launches, [agent('running', 4)])).toBe(launches)
  })

  test.each<PaneActivity>(['working', 'needs-input', 'done', 'exited', 'error'])(
    'forgets a start once its agent is %s',
    (activity) => {
      expect(settleLaunches([{ number: 4, phase: 'started' }], [agent(activity, 4)])).toEqual([])
    },
  )

  test('forgets a start whose agents were all closed', () => {
    expect(settleLaunches([{ number: 4, phase: 'started' }], [])).toEqual([])
  })

  test('keeps a start that is still being requested', () => {
    const launches: Launch[] = [{ number: 4, phase: 'requesting' }]

    expect(settleLaunches(launches, [])).toBe(launches)
  })
})

describe('tasksToStart', () => {
  test('starts queued tasks in order while slots are free', () => {
    const queue = [queued(1), queued(2), queued(3)]

    expect(tasksToStart(queue, 3, 1, []).map((task) => task.number)).toEqual([1, 2])
  })

  test('starts nothing when every slot is busy, or more are busy than allowed', () => {
    expect(tasksToStart([queued(1)], 1, 1, [])).toEqual([])
    expect(tasksToStart([queued(1)], 1, 3, [])).toEqual([])
  })

  test('skips a task that is already starting', () => {
    const launches: Launch[] = [{ number: 1, phase: 'requesting' }]

    expect(tasksToStart([queued(1), queued(2)], 3, 1, launches)).toEqual([queued(2)])
  })
})
