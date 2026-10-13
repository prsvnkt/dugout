import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { FileService } from '../services/files/FileService'
import {
  FakeIpcMain,
  MANAGED_WORKTREE,
  PROJECT_ID,
  PROJECT_ROOT,
  UNMANAGED_FOLDER,
  fakeProjects,
  fakeWorktrees,
  silenceIpcLogs,
} from './fakeIpcMain'
import { registerFileIpc } from './registerFileIpc'

const FILE_METHODS = ['readDir', 'readFile', 'stat', 'writeFile'] as const
type FileMethod = (typeof FILE_METHODS)[number]

function setup() {
  const files = Object.fromEntries(
    FILE_METHODS.map((method) => [method, vi.fn(async () => ({ from: method }))]),
  ) as Record<FileMethod, ReturnType<typeof vi.fn>>
  const worktrees = fakeWorktrees()
  const ipc = new FakeIpcMain()
  registerFileIpc(fakeProjects(), worktrees.manager, files as unknown as FileService, ipc)
  return { ipc, files, resolveCheckout: worktrees.resolveCheckout }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const forwarding: {
  channel: string
  payload: Record<string, unknown>
  method: FileMethod
  args: unknown[]
}[] = [
  { channel: IpcChannel.filesReadDir, payload: { path: '' }, method: 'readDir', args: [''] },
  {
    channel: IpcChannel.filesRead,
    payload: { path: 'src/a.ts' },
    method: 'readFile',
    args: ['src/a.ts'],
  },
  {
    channel: IpcChannel.filesStat,
    payload: { paths: ['a.ts', 'b.ts'] },
    method: 'stat',
    args: [['a.ts', 'b.ts']],
  },
  {
    channel: IpcChannel.filesWrite,
    payload: { path: 'a.ts', content: 'x', expectedMtimeMs: 12, force: true },
    method: 'writeFile',
    args: ['a.ts', 'x', { expectedMtimeMs: 12, force: true }],
  },
]

describe('registerFileIpc', () => {
  test('registers every file channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(forwarding.map((row) => row.channel).sort())
  })

  test.each(forwarding)(
    '$channel reads through FileService.$method at the main checkout',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, files } = setup()

      // Act
      const result = await ipc.invoke(channel, { projectId: PROJECT_ID, ...payload })

      // Assert
      expect(result).toEqual({ ok: true, data: { from: method } })
      expect(files[method]).toHaveBeenCalledWith(PROJECT_ROOT, ...args)
    },
  )

  test.each(forwarding)(
    '$channel uses a managed worktree as the root',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, files } = setup()

      // Act
      await ipc.invoke(channel, {
        projectId: PROJECT_ID,
        worktreePath: MANAGED_WORKTREE,
        ...payload,
      })

      // Assert
      expect(files[method]).toHaveBeenCalledWith(MANAGED_WORKTREE, ...args)
    },
  )

  test.each(forwarding)(
    '$channel refuses an unmanaged folder as the root',
    async ({ channel, payload, method }) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, files } = setup()

      // Act
      const result = await ipc.invoke(channel, {
        projectId: PROJECT_ID,
        worktreePath: UNMANAGED_FOLDER,
        ...payload,
      })

      // Assert
      expect(result.ok).toBe(false)
      expect(files[method]).not.toHaveBeenCalled()
    },
  )

  test.each([
    [IpcChannel.filesRead, { projectId: PROJECT_ID, path: '../../etc/passwd' }],
    [IpcChannel.filesRead, { projectId: PROJECT_ID, path: '/etc/passwd' }],
    [IpcChannel.filesReadDir, { projectId: PROJECT_ID, path: 'a/../../b' }],
    [IpcChannel.filesStat, { projectId: PROJECT_ID, paths: ['ok.ts', 'nul\0byte'] }],
    [IpcChannel.filesWrite, { projectId: PROJECT_ID, path: 'a.ts', content: 'x' }],
  ])('%s rejects the invalid payload %j', async (channel, payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, files, resolveCheckout } = setup()

    // Act
    const result = await ipc.invoke(channel, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(resolveCheckout).not.toHaveBeenCalled()
    for (const method of FILE_METHODS) expect(files[method]).not.toHaveBeenCalled()
  })
})
