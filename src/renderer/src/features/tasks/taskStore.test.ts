import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fail, ok, type Result } from '@shared/result'
import type { Task, TaskDetail } from '@shared/tasks'
import type { TaskSession } from '@shared/taskSession'
import { useTaskQueueStore } from '@renderer/features/taskQueue/taskQueueStore'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useTaskStore } from './taskStore'

const PROJECT = 'project-1'
const initialTasks = useTaskStore.getState()
const initialQueue = useTaskQueueStore.getState()
const initialWorkspace = useWorkspaceStore.getState()

const store = () => useTaskStore.getState()
const tasksOf = () => store().byProject[PROJECT]

function task(number: number, title = `Task ${number}`): Task {
  return {
    number,
    key: `#${number}`,
    title,
    body: '',
    status: 'todo',
    url: `https://example.test/${number}`,
    author: 'someone',
    labels: [],
    priority: null,
    commentCount: 0,
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

const detail = (number: number): TaskDetail => ({ ...task(number), comments: [] })

/** A promise the test settles by hand, to hold an IPC answer in flight. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((settle) => {
    resolve = settle
  })
  return { promise, resolve }
}

beforeEach(() => {
  // `reset` also clears the module-level in-flight and epoch bookkeeping.
  store().reset(PROJECT)
  useTaskStore.setState(initialTasks, true)
  useTaskQueueStore.setState(initialQueue, true)
  useWorkspaceStore.setState(initialWorkspace, true)
  setFakeDugout({
    tasks: {
      list: vi.fn(async () => ok([task(1)])),
      get: vi.fn(async (_projectId: string, number: number) => ok(detail(number))),
    },
  })
})

describe('refresh', () => {
  test('loads the tasks and reloads the details of viewed tasks', async () => {
    // Arrange
    await store().view(PROJECT, 1)

    // Act
    await store().refresh(PROJECT)

    // Assert
    expect(tasksOf()?.tasks).toEqual([task(1)])
    expect(tasksOf()?.error).toBeNull()
    expect(tasksOf()?.details[1]).toEqual(detail(1))
  })

  test('keeps the last tasks and shows the error when listing fails', async () => {
    // Arrange
    await store().refresh(PROJECT)
    setFakeDugout({ tasks: { list: async () => fail('GitHub is unreachable') } })

    // Act
    await store().refresh(PROJECT)

    // Assert
    expect(tasksOf()).toMatchObject({ tasks: [task(1)], error: 'GitHub is unreachable' })
  })

  test('a second refresh while one is in flight does not ask again', async () => {
    // Arrange
    const answer = deferred<Result<readonly Task[]>>()
    const list = vi.fn(() => answer.promise)
    setFakeDugout({ tasks: { list } })

    // Act
    const first = store().refresh(PROJECT)
    await store().refresh(PROJECT)
    answer.resolve(ok([task(2)]))
    await first

    // Assert
    expect(list).toHaveBeenCalledTimes(1)
    expect(tasksOf()?.tasks).toEqual([task(2)])
  })

  test('reset during an in-flight refresh drops its late answer and allows a new refresh', async () => {
    // Arrange
    const stale = deferred<Result<readonly Task[]>>()
    const list = vi
      .fn<() => Promise<Result<readonly Task[]>>>()
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce(ok([task(7, 'From the new source')]))
    setFakeDugout({ tasks: { list } })
    const late = store().refresh(PROJECT)

    // Act
    store().reset(PROJECT)
    await store().refresh(PROJECT)
    stale.resolve(ok([task(1, 'From the old source')]))
    await late

    // Assert
    expect(list).toHaveBeenCalledTimes(2)
    expect(tasksOf()?.tasks).toEqual([task(7, 'From the new source')])
  })
})

describe('view and unview', () => {
  test('viewing a task loads its details once and tracks it until unviewed', async () => {
    // Act
    await store().view(PROJECT, 3)
    await store().view(PROJECT, 3)

    // Assert
    expect(tasksOf()?.viewing).toEqual([3])
    expect(tasksOf()?.details[3]).toEqual(detail(3))

    // Act
    store().unview(PROJECT, 3)

    // Assert
    expect(tasksOf()?.viewing).toEqual([])
  })

  test('unviewing a task that is not viewed changes nothing', () => {
    // Arrange
    const before = useTaskStore.getState()

    // Act
    store().unview(PROJECT, 3)

    // Assert
    expect(useTaskStore.getState()).toBe(before)
  })

  test('a failed detail load is kept per task and cleared by the next good load', async () => {
    // Arrange
    setFakeDugout({ tasks: { get: async () => fail('Not found') } })
    await store().view(PROJECT, 4)
    expect(tasksOf()?.detailErrors).toEqual({ 4: 'Not found' })
    setFakeDugout({ tasks: { get: async (_projectId, number) => ok(detail(number)) } })

    // Act
    await store().view(PROJECT, 4)

    // Assert
    expect(tasksOf()?.detailErrors).toEqual({})
    expect(tasksOf()?.details[4]).toEqual(detail(4))
  })
})

describe('startAgent', () => {
  const session: TaskSession = {
    sessions: [
      { agent: 'claude', worktree: { path: '/repo/.w/t5', branch: 'dugout/t5', name: 't5' } },
    ],
    prompt: 'Work on #5',
    task: { number: 5, key: '#5', title: 'Task 5' },
  }

  test('opens an agent pane per session and marks the launch started', async () => {
    // Arrange
    setFakeDugout({
      tasks: { list: async () => ok([task(5)]), startSession: async () => ok(session) },
    })

    // Act
    await store().startAgent(PROJECT, 5, ['claude'])

    // Assert
    const panes = useWorkspaceStore.getState().layouts[PROJECT]?.panes ?? []
    expect(panes).toEqual([
      expect.objectContaining({ kind: 'claude', initialPrompt: 'Work on #5', task: session.task }),
    ])
    expect(useTaskQueueStore.getState().launches[PROJECT]).toEqual([
      { number: 5, phase: 'started' },
    ])
    expect(tasksOf()?.isBusy).toBe(false)
  })

  test('a failed start throws its message, frees the slot and does not leave the panel busy', async () => {
    // Arrange
    setFakeDugout({
      tasks: {
        list: async () => ok([task(5)]),
        startSession: async () => fail('Could not create the worktree'),
      },
    })

    // Act
    const started = store().startAgent(PROJECT, 5, ['claude'])

    // Assert
    await expect(started).rejects.toThrow('Could not create the worktree')
    expect(tasksOf()?.isBusy).toBe(false)
    expect(useTaskQueueStore.getState().launches[PROJECT]).toEqual([])
    expect(useWorkspaceStore.getState().layouts[PROJECT]).toBeUndefined()
  })

  test('counts the launch synchronously, before the start is answered', () => {
    // Arrange
    setFakeDugout({
      tasks: { list: async () => ok([]), startSession: () => new Promise(() => {}) },
    })

    // Act
    void store().startAgent(PROJECT, 5, ['claude'])

    // Assert
    expect(useTaskQueueStore.getState().launches[PROJECT]).toEqual([
      { number: 5, phase: 'requesting' },
    ])
    expect(tasksOf()?.isBusy).toBe(true)
  })
})

describe('create', () => {
  test('returns the new task and refreshes the list', async () => {
    // Arrange
    const list = vi.fn(async () => ok([task(1), task(2)]))
    setFakeDugout({ tasks: { list, create: async () => ok(task(2)) } })

    // Act
    const created = await store().create({ projectId: PROJECT, title: 'Task 2', body: '' })

    // Assert
    expect(created).toEqual(task(2))
    expect(list).toHaveBeenCalledTimes(1)
    expect(tasksOf()).toMatchObject({ isBusy: false, tasks: [task(1), task(2)] })
  })
})
