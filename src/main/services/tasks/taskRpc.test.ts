import { describe, expect, test, vi } from 'vitest'
import type { Task } from '@shared/tasks'
import { handleTaskRpc, LIST_COVERAGE, type TaskRpcTasks } from './taskRpc'

const task = (number: number, extra: Partial<Task> = {}): Task => ({
  number,
  key: `#${number}`,
  title: `Task ${number}`,
  body: `Body of task ${number}`,
  status: 'todo',
  url: `https://github.com/octo/app/issues/${number}`,
  author: 'octo',
  labels: [],
  priority: null,
  commentCount: 0,
  updatedAt: '2026-10-01T00:00:00Z',
  ...extra,
})

function setup(list: Task[] = []) {
  const tasks = {
    list: vi.fn(async () => list),
    get: vi.fn(async (_projectId: string, number: number) => ({ ...task(number), comments: [] })),
    create: vi.fn(async (_projectId: string, input: { title: string }) =>
      task(10, { title: input.title }),
    ),
    update: vi.fn(async () => task(5, { status: 'in-review' })),
    comment: vi.fn(async () => undefined),
  }
  const call = (method: string, params: unknown = {}) =>
    handleTaskRpc(tasks as unknown as TaskRpcTasks, 'p1', method, params)
  return { tasks, call }
}

describe('task RPC from agents', () => {
  test('lists tasks without their descriptions', async () => {
    const { call } = setup([task(1, { labels: ['bug', 'dugout:in-progress'] })])

    const result = await call('list')

    expect(result).toEqual({
      covers: LIST_COVERAGE,
      tasks: [
        {
          number: 1,
          key: '#1',
          title: 'Task 1',
          status: 'todo',
          priority: null,
          labels: ['bug'],
          updatedAt: '2026-10-01T00:00:00Z',
        },
      ],
    })
  })

  test('says which tasks an empty list covers', async () => {
    const { call } = setup([])
    const result = (await call('list', { status: 'done' })) as { covers: string; tasks: unknown[] }
    expect(result.tasks).toEqual([])
    expect(result.covers).toContain('Open and closed tasks')
    expect(result.covers).toContain('status is done')
  })

  test('lists the highest priority first, keeping the update order within a priority', async () => {
    const { call } = setup([
      task(1),
      task(2, { priority: 'low' }),
      task(3, { priority: 'high' }),
      task(4, { priority: 'high' }),
    ])

    const result = (await call('list')) as { tasks: { number: number; priority: string }[] }

    expect(result.tasks.map((t) => [t.number, t.priority])).toEqual([
      [3, 'high'],
      [4, 'high'],
      [2, 'low'],
      [1, null],
    ])
  })

  test('filters by status and by words in the title or description', async () => {
    const { call } = setup([
      task(1, { title: 'Dark mode toggle' }),
      task(2, { body: 'Support DARK themes and a mode switch', status: 'done' }),
      task(3, { title: 'Dark sidebar' }),
    ])

    const all = (await call('list', { search: 'dark  MODE' })) as { tasks: { number: number }[] }
    const open = (await call('list', { search: 'dark mode', status: 'todo' })) as {
      tasks: { number: number }[]
    }

    expect(all.tasks.map((t) => t.number)).toEqual([1, 2])
    expect(open.tasks.map((t) => t.number)).toEqual([1])
  })

  test('create returns only the number, url and status', async () => {
    const { call, tasks } = setup()

    const result = await call('create', { title: 'New', priority: 'high', related: [3] })

    expect(tasks.create).toHaveBeenCalledWith('p1', {
      title: 'New',
      body: '',
      priority: 'high',
      related: [3],
    })
    expect(result).toEqual({
      number: 10,
      key: '#10',
      url: 'https://github.com/octo/app/issues/10',
      status: 'todo',
    })
  })

  test('update returns only the number, url and status, and maps priority "none" to null', async () => {
    const { call, tasks } = setup()

    const result = await call('update', { number: 5, priority: 'none', addLabels: ['ui'] })

    expect(tasks.update).toHaveBeenCalledWith('p1', 5, { priority: null, addLabels: ['ui'] })
    expect(result).toEqual({
      number: 5,
      key: '#5',
      url: 'https://github.com/octo/app/issues/5',
      status: 'in-review',
    })
  })

  test('refuses Dugout labels, which are set through status and priority', async () => {
    const { call, tasks } = setup()
    await expect(call('update', { number: 5, addLabels: ['dugout:in-review'] })).rejects.toThrow()
    await expect(call('create', { title: 'x', labels: ['dugout:priority-high'] })).rejects.toThrow()
    expect(tasks.update).not.toHaveBeenCalled()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  test('creates a batch of tasks in order', async () => {
    const { call, tasks } = setup()
    let next = 20
    tasks.create.mockImplementation(async (_projectId, input) => task(next++, input))

    const result = await call('createMany', { tasks: [{ title: 'A' }, { title: 'B' }] })

    expect(tasks.create.mock.calls.map(([, input]) => input.title)).toEqual(['A', 'B'])
    expect(result).toEqual({
      created: [
        { number: 20, key: '#20', url: 'https://github.com/octo/app/issues/20', status: 'todo' },
        { number: 21, key: '#21', url: 'https://github.com/octo/app/issues/21', status: 'todo' },
      ],
    })
  })

  test('a failing batch says which tasks were already created', async () => {
    const { call, tasks } = setup()
    tasks.create
      .mockImplementationOnce(async () => task(30))
      .mockImplementationOnce(async () => Promise.reject(new Error('Validation failed.')))

    await expect(
      call('createMany', { tasks: [{ title: 'A' }, { title: 'B' }, { title: 'C' }] }),
    ).rejects.toThrow('Task 2 ("B") failed: Validation failed. Already created: #30.')
    expect(tasks.create).toHaveBeenCalledTimes(2)
  })

  test('validates the whole batch before creating any task', async () => {
    const { call, tasks } = setup()
    await expect(call('createMany', { tasks: [{ title: 'A' }, { title: '' }] })).rejects.toThrow()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  test('gets, comments, and rejects unknown operations', async () => {
    const { call, tasks } = setup()
    await expect(call('get', { number: 4 })).resolves.toMatchObject({ number: 4 })
    await expect(call('comment', { number: 4, body: 'Note' })).resolves.toEqual({ ok: true })
    expect(tasks.comment).toHaveBeenCalledWith('p1', 4, 'Note')
    await expect(call('delete', { number: 4 })).rejects.toThrow('Unknown task operation')
  })
})
