import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { FakeIpcMain, PROJECT_ID, silenceIpcLogs } from './fakeIpcMain'
import { registerProjectIpc } from './registerProjectIpc'

const STORE_METHODS = [
  'list',
  'add',
  'remove',
  'setDevCommand',
  'setCheckCommand',
  'setTaskSource',
  'setWorktreeSetup',
  'changeTaskQueue',
  'setMaxAgents',
] as const
type StoreMethod = (typeof STORE_METHODS)[number]

function setup() {
  const store = Object.fromEntries(
    STORE_METHODS.map((method) => [method, vi.fn(async () => ({ from: method }))]),
  ) as Record<StoreMethod, ReturnType<typeof vi.fn>>
  const ipc = new FakeIpcMain()
  registerProjectIpc(store as unknown as ProjectStore, ipc)
  return { ipc, store }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const QUEUED_TASK = { number: 4, key: '#4', title: 'Docs', agent: 'claude' }

const forwarding: { channel: string; payload: unknown; method: StoreMethod; args: unknown[] }[] = [
  { channel: IpcChannel.projectList, payload: undefined, method: 'list', args: [] },
  {
    channel: IpcChannel.projectAdd,
    payload: { rootPath: '/repos/demo' },
    method: 'add',
    args: [{ rootPath: '/repos/demo' }],
  },
  {
    channel: IpcChannel.projectRemove,
    payload: { id: PROJECT_ID },
    method: 'remove',
    args: [PROJECT_ID],
  },
  {
    // Trimmed by the schema before it reaches the store.
    channel: IpcChannel.projectSetDevCommand,
    payload: { id: PROJECT_ID, command: '  npm run dev  ' },
    method: 'setDevCommand',
    args: [PROJECT_ID, 'npm run dev'],
  },
  {
    channel: IpcChannel.projectSetCheckCommand,
    payload: { id: PROJECT_ID, command: null },
    method: 'setCheckCommand',
    args: [PROJECT_ID, null],
  },
  {
    channel: IpcChannel.projectSetTaskSource,
    payload: { projectId: PROJECT_ID, source: { kind: 'linear', teamKey: 'ENG' } },
    method: 'setTaskSource',
    args: [PROJECT_ID, { kind: 'linear', teamKey: 'ENG' }],
  },
  {
    channel: IpcChannel.projectSetWorktreeSetup,
    payload: { id: PROJECT_ID, setup: { copy: ['.env'], command: 'npm ci' } },
    method: 'setWorktreeSetup',
    args: [PROJECT_ID, { copy: ['.env'], command: 'npm ci' }],
  },
  {
    channel: IpcChannel.projectChangeTaskQueue,
    payload: { id: PROJECT_ID, change: { kind: 'add', task: QUEUED_TASK } },
    method: 'changeTaskQueue',
    args: [PROJECT_ID, { kind: 'add', task: QUEUED_TASK }],
  },
  {
    channel: IpcChannel.projectSetMaxAgents,
    payload: { id: PROJECT_ID, maxAgents: 2 },
    method: 'setMaxAgents',
    args: [PROJECT_ID, 2],
  },
]

describe('registerProjectIpc', () => {
  test('registers every project channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(forwarding.map((row) => row.channel).sort())
  })

  test.each(forwarding)(
    '$channel forwards the parsed request to store.$method',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, store } = setup()

      // Act
      const result = await ipc.invoke(channel, payload)

      // Assert
      expect(result).toEqual({ ok: true, data: { from: method } })
      expect(store[method]).toHaveBeenCalledWith(...args)
    },
  )

  test.each([
    [IpcChannel.projectList, { unexpected: true }],
    [IpcChannel.projectAdd, { rootPath: 'relative/repo' }],
    [IpcChannel.projectRemove, { id: '' }],
    [IpcChannel.projectSetDevCommand, { id: PROJECT_ID, command: 'npm run dev\nrm -rf /' }],
    [IpcChannel.projectSetCheckCommand, { id: PROJECT_ID, command: 'a\nb' }],
    [IpcChannel.projectSetTaskSource, { projectId: PROJECT_ID, source: { kind: 'jira' } }],
    [IpcChannel.projectSetWorktreeSetup, { id: PROJECT_ID, setup: { copy: ['../secrets'] } }],
    [
      IpcChannel.projectChangeTaskQueue,
      { id: PROJECT_ID, change: { kind: 'move', number: 1, offset: 2 } },
    ],
    [IpcChannel.projectSetMaxAgents, { id: PROJECT_ID, maxAgents: 0 }],
  ])('%s rejects the invalid payload %j', async (channel, payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, store } = setup()

    // Act
    const result = await ipc.invoke(channel, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    for (const method of STORE_METHODS) expect(store[method]).not.toHaveBeenCalled()
  })
})
