import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { ContextStore } from '../services/context/ContextStore'
import { FakeIpcMain, PROJECT_ID, fakeProjects, silenceIpcLogs, testProject } from './fakeIpcMain'
import { registerContextIpc } from './registerContextIpc'

const STORE_METHODS = [
  'read',
  'add',
  'edit',
  'remove',
  'repin',
  'approve',
  'discard',
  'addDoc',
  'saveCodemap',
] as const
type StoreMethod = (typeof STORE_METHODS)[number]

function setup(pickDocument = vi.fn(async (): Promise<string | null> => null)) {
  const store = Object.fromEntries(
    STORE_METHODS.map((method) => [method, vi.fn(async () => ({ from: method }))]),
  ) as Record<StoreMethod, ReturnType<typeof vi.fn>>
  const buildCodemap = vi.fn(async () => '# Codemap')
  const ipc = new FakeIpcMain()
  registerContextIpc(
    {
      projects: fakeProjects(),
      store: store as unknown as ContextStore,
      buildCodemap,
      pickDocument,
    },
    ipc,
  )
  return { ipc, store, buildCodemap, pickDocument }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const forwarding: {
  channel: string
  payload: Record<string, unknown>
  method: StoreMethod
  args: unknown[]
}[] = [
  { channel: IpcChannel.contextRead, payload: {}, method: 'read', args: [] },
  {
    // The title is trimmed: the parsed entry is what reaches the store.
    channel: IpcChannel.contextAdd,
    payload: { entry: { kind: 'note', scope: 'shared', title: '  Setup  ', body: 'npm ci' } },
    method: 'add',
    args: [{ kind: 'note', scope: 'shared', title: 'Setup', body: 'npm ci' }],
  },
  {
    channel: IpcChannel.contextEdit,
    payload: { id: 'setup', title: 'Setup', body: 'npm install' },
    method: 'edit',
    args: [{ id: 'setup', title: 'Setup', body: 'npm install' }],
  },
  {
    channel: IpcChannel.contextRemove,
    payload: { id: 'setup' },
    method: 'remove',
    args: ['setup'],
  },
  { channel: IpcChannel.contextRepin, payload: { id: 'setup' }, method: 'repin', args: ['setup'] },
  {
    channel: IpcChannel.contextApprove,
    payload: { id: 'setup' },
    method: 'approve',
    args: ['setup'],
  },
  {
    channel: IpcChannel.contextDiscard,
    payload: { id: 'setup' },
    method: 'discard',
    args: ['setup'],
  },
]

describe('registerContextIpc', () => {
  test('registers every context channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        ...forwarding.map((row) => row.channel),
        IpcChannel.contextImportDoc,
        IpcChannel.contextBuildCodemap,
      ].sort(),
    )
  })

  test.each(forwarding)(
    '$channel forwards the parsed request to store.$method',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, store } = setup()

      // Act
      const result = await ipc.invoke(channel, { projectId: PROJECT_ID, ...payload })

      // Assert
      expect(result).toEqual({ ok: true, data: { from: method } })
      expect(store[method]).toHaveBeenCalledWith(testProject(), ...args)
    },
  )

  test.each(forwarding)(
    '$channel fails for an unknown project',
    async ({ channel, payload, method }) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, store } = setup()

      // Act
      const result = await ipc.invoke(channel, { projectId: 'missing', ...payload })

      // Assert
      expect(result).toEqual({ ok: false, error: 'Project not found.' })
      expect(store[method]).not.toHaveBeenCalled()
    },
  )

  test.each([
    [IpcChannel.contextRemove, { projectId: PROJECT_ID, id: '../escape' }],
    [IpcChannel.contextEdit, { projectId: PROJECT_ID, id: 'a', title: '', body: '' }],
    [
      IpcChannel.contextAdd,
      {
        projectId: PROJECT_ID,
        entry: { kind: 'link', scope: 'shared', title: 'x', body: '', url: 'javascript:alert(1)' },
      },
    ],
    [
      IpcChannel.contextAdd,
      {
        projectId: PROJECT_ID,
        entry: { kind: 'file', scope: 'shared', title: 'x', body: '', path: '/etc/passwd' },
      },
    ],
    [IpcChannel.contextImportDoc, { projectId: PROJECT_ID, scope: 'public' }],
    [IpcChannel.contextBuildCodemap, { projectId: PROJECT_ID, agent: 'gpt' }],
  ])('%s rejects the invalid payload %j', async (channel, payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, store, pickDocument, buildCodemap } = setup()

    // Act
    const result = await ipc.invoke(channel, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    for (const method of STORE_METHODS) expect(store[method]).not.toHaveBeenCalled()
    expect(pickDocument).not.toHaveBeenCalled()
    expect(buildCodemap).not.toHaveBeenCalled()
  })
})

describe('registerContextIpc import document', () => {
  test('returns null when the user cancels the picker', async () => {
    // Arrange
    const { ipc, store, pickDocument } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.contextImportDoc, {
      projectId: PROJECT_ID,
      scope: 'shared',
    })

    // Assert
    expect(result).toEqual({ ok: true, data: null })
    expect(pickDocument).toHaveBeenCalledTimes(1)
    expect(store.addDoc).not.toHaveBeenCalled()
  })

  test('adds the picked document, titled by its first heading', async () => {
    // Arrange
    const path = join(mkdtempSync(join(tmpdir(), 'dugout-context-ipc-')), 'notes.md')
    writeFileSync(path, '# Release steps\n\nTag, then push.\n')
    const { ipc, store } = setup(vi.fn(async () => path))

    // Act
    const result = await ipc.invoke(IpcChannel.contextImportDoc, {
      projectId: PROJECT_ID,
      scope: 'private',
    })

    // Assert
    expect(result).toEqual({ ok: true, data: { from: 'addDoc' } })
    expect(store.addDoc).toHaveBeenCalledWith(testProject(), 'private', {
      title: 'Release steps',
      source: 'notes.md',
      body: '# Release steps\n\nTag, then push.\n',
    })
  })

  test('does not open the picker for an unknown project', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, pickDocument } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.contextImportDoc, {
      projectId: 'missing',
      scope: 'shared',
    })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(pickDocument).not.toHaveBeenCalled()
  })
})

describe('registerContextIpc build codemap', () => {
  test("runs the agent at the project's root and saves its codemap", async () => {
    // Arrange
    const { ipc, store, buildCodemap } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.contextBuildCodemap, {
      projectId: PROJECT_ID,
      agent: 'codex',
    })

    // Assert
    expect(result).toEqual({ ok: true, data: { from: 'saveCodemap' } })
    expect(buildCodemap).toHaveBeenCalledWith('codex', testProject().rootPath)
    expect(store.saveCodemap).toHaveBeenCalledWith(testProject(), 'codex', '# Codemap')
  })

  test('builds one codemap per project at a time', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, buildCodemap } = setup()
    let finish: (markdown: string) => void = () => {}
    buildCodemap.mockImplementationOnce(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve
        }),
    )
    const request = { projectId: PROJECT_ID, agent: 'claude' }
    const first = ipc.invoke(IpcChannel.contextBuildCodemap, request)
    await vi.waitFor(() => expect(buildCodemap).toHaveBeenCalledTimes(1))

    // Act
    const second = await ipc.invoke(IpcChannel.contextBuildCodemap, request)
    finish('# First')
    await first
    const third = await ipc.invoke(IpcChannel.contextBuildCodemap, request)

    // Assert
    expect(second).toEqual({ ok: false, error: 'A codemap is already being built.' })
    expect(third.ok).toBe(true)
  })

  test('lets the project build again after a failed build', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, buildCodemap } = setup()
    buildCodemap.mockRejectedValueOnce(new Error('claude exited with code 1'))
    const request = { projectId: PROJECT_ID, agent: 'claude' }

    // Act
    const failed = await ipc.invoke(IpcChannel.contextBuildCodemap, request)
    const retried = await ipc.invoke(IpcChannel.contextBuildCodemap, request)

    // Assert
    expect(failed).toEqual({ ok: false, error: 'claude exited with code 1' })
    expect(retried.ok).toBe(true)
  })
})
