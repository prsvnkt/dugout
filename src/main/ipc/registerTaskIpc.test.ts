import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { TaskService } from '../services/tasks/TaskService'
import { taskPrompt } from '../services/tasks/taskSession'
import {
  FakeIpcMain,
  PROJECT_ID,
  fakeProjects,
  fakeWorktrees,
  silenceIpcLogs,
  testProject,
} from './fakeIpcMain'
import { registerTaskIpc } from './registerTaskIpc'

const TASK_URL = 'https://github.com/acme/demo/issues/12'
const TASK = {
  number: 12,
  key: '#12',
  title: 'Fix login',
  body: 'It fails.',
  url: TASK_URL,
  status: 'todo',
}

const TASK_METHODS = ['list', 'get', 'create', 'update', 'comment', 'webUrl'] as const
type TaskMethod = (typeof TASK_METHODS)[number]

function setup(task: Record<string, unknown> = TASK) {
  const tasks = Object.fromEntries(
    TASK_METHODS.map((method) => [method, vi.fn(async () => ({ from: method }))]),
  ) as Record<TaskMethod, ReturnType<typeof vi.fn>>
  tasks.get.mockResolvedValue(task)
  tasks.webUrl.mockResolvedValue(TASK_URL)
  const create = vi.fn(async (_project: unknown, options: { name: string }) => ({
    path: `/worktrees/p1/${options.name}`,
    branch: `dugout/${options.name}`,
    name: options.name,
  }))
  const worktrees = fakeWorktrees([], { create })
  const openExternal = vi.fn(async () => {})
  const ipc = new FakeIpcMain()
  registerTaskIpc(
    {
      tasks: tasks as unknown as TaskService,
      projects: fakeProjects(),
      worktrees: worktrees.manager,
      openExternal,
    },
    ipc,
  )
  return { ipc, tasks, create, openExternal }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const forwarding: {
  channel: string
  payload: Record<string, unknown>
  method: TaskMethod
  args: unknown[]
}[] = [
  { channel: IpcChannel.tasksList, payload: {}, method: 'list', args: [] },
  { channel: IpcChannel.tasksGet, payload: { number: 12 }, method: 'get', args: [12] },
  {
    // The title is trimmed and the body defaults to '': the parsed input is forwarded.
    channel: IpcChannel.tasksCreate,
    payload: { title: '  Add dark mode ', labels: ['ui'] },
    method: 'create',
    args: [{ title: 'Add dark mode', body: '', labels: ['ui'] }],
  },
  {
    // "none" clears the priority.
    channel: IpcChannel.tasksUpdate,
    payload: { number: 12, status: 'done', priority: 'none' },
    method: 'update',
    args: [12, { status: 'done', priority: null }],
  },
  {
    channel: IpcChannel.tasksComment,
    payload: { number: 12, body: '  Fixed in #13 ' },
    method: 'comment',
    args: [12, 'Fixed in #13'],
  },
]

describe('registerTaskIpc', () => {
  test('registers every task channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        ...forwarding.map((row) => row.channel),
        IpcChannel.tasksOpen,
        IpcChannel.tasksStartSession,
      ].sort(),
    )
  })

  test.each(forwarding)(
    '$channel forwards the parsed request to tasks.$method',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, tasks } = setup()

      // Act
      const result = await ipc.invoke(channel, { projectId: PROJECT_ID, ...payload })

      // Assert
      expect(result.ok).toBe(true)
      expect(tasks[method]).toHaveBeenCalledWith(PROJECT_ID, ...args)
    },
  )

  test.each([
    [IpcChannel.tasksList, {}],
    [IpcChannel.tasksGet, { projectId: PROJECT_ID, number: 0 }],
    [IpcChannel.tasksCreate, { projectId: PROJECT_ID, title: '' }],
    [IpcChannel.tasksCreate, { projectId: PROJECT_ID, title: 'x', labels: ['dugout:done'] }],
    [IpcChannel.tasksUpdate, { projectId: PROJECT_ID, number: 1, status: 'blocked' }],
    [IpcChannel.tasksComment, { projectId: PROJECT_ID, number: 1, body: ' ' }],
    [IpcChannel.tasksOpen, { projectId: PROJECT_ID }],
    [IpcChannel.tasksStartSession, { projectId: PROJECT_ID, number: 1, agents: [] }],
    [IpcChannel.tasksStartSession, { projectId: PROJECT_ID, number: 1, agents: ['gpt'] }],
  ])('%s rejects the invalid payload %j', async (channel, payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, tasks, create, openExternal } = setup()

    // Act
    const result = await ipc.invoke(channel, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    for (const method of TASK_METHODS) expect(tasks[method]).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })

  test("opens the task's own web page", async () => {
    // Arrange
    const { ipc, tasks, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.tasksOpen, { projectId: PROJECT_ID, number: 12 })

    // Assert
    expect(result).toEqual({ ok: true, data: undefined })
    expect(tasks.webUrl).toHaveBeenCalledWith(PROJECT_ID, 12)
    expect(openExternal).toHaveBeenCalledWith(TASK_URL)
  })
})

describe('registerTaskIpc start session', () => {
  test('creates a worktree named after the task, marks it in progress and returns the prompt', async () => {
    // Arrange
    const { ipc, tasks, create } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.tasksStartSession, {
      projectId: PROJECT_ID,
      number: 12,
      agents: ['claude'],
    })

    // Assert
    expect(create).toHaveBeenCalledWith(testProject(), { name: '12-fix-login' })
    expect(tasks.update).toHaveBeenCalledWith(PROJECT_ID, 12, { status: 'in-progress' })
    expect(result).toEqual({
      ok: true,
      data: {
        sessions: [
          {
            agent: 'claude',
            worktree: {
              path: '/worktrees/p1/12-fix-login',
              branch: 'dugout/12-fix-login',
              name: '12-fix-login',
            },
          },
        ],
        prompt: taskPrompt(TASK),
        task: { number: 12, key: '#12', title: 'Fix login' },
      },
    })
  })

  test('gives each agent its own worktree, named after the agent', async () => {
    // Arrange
    const { ipc, create } = setup()

    // Act
    await ipc.invoke(IpcChannel.tasksStartSession, {
      projectId: PROJECT_ID,
      number: 12,
      agents: ['claude', 'codex'],
    })

    // Assert
    expect(create.mock.calls.map(([, options]) => options.name)).toEqual([
      '12-fix-login-claude',
      '12-fix-login-codex',
    ])
  })

  test('leaves a task that is already in progress as it is', async () => {
    // Arrange
    const { ipc, tasks } = setup({ ...TASK, status: 'in-progress' })

    // Act
    await ipc.invoke(IpcChannel.tasksStartSession, {
      projectId: PROJECT_ID,
      number: 12,
      agents: ['claude'],
    })

    // Assert
    expect(tasks.update).not.toHaveBeenCalled()
  })

  test('creates no worktree for an unknown project', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, create } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.tasksStartSession, {
      projectId: 'missing',
      number: 12,
      agents: ['claude'],
    })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(create).not.toHaveBeenCalled()
  })
})
