import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import {
  FakeIpcMain,
  MANAGED_WORKTREE,
  PROJECT_ID,
  fakeProjects,
  silenceIpcLogs,
  testProject,
} from './fakeIpcMain'
import { registerWorktreeIpc } from './registerWorktreeIpc'

function setup() {
  const worktrees = {
    list: vi.fn(async () => ({ from: 'list' })),
    create: vi.fn(async () => ({ from: 'create' })),
    remove: vi.fn(async () => ({ from: 'remove' })),
  }
  const ipc = new FakeIpcMain()
  registerWorktreeIpc(fakeProjects(), worktrees as unknown as WorktreeManager, ipc)
  return { ipc, worktrees }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerWorktreeIpc', () => {
  test('registers the worktree channels', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [IpcChannel.worktreeList, IpcChannel.worktreeCreate, IpcChannel.worktreeRemove].sort(),
    )
  })

  test.each([
    [IpcChannel.worktreeList, {}, 'list', []],
    [IpcChannel.worktreeCreate, {}, 'create', []],
    [IpcChannel.worktreeRemove, { path: MANAGED_WORKTREE }, 'remove', [MANAGED_WORKTREE]],
  ] as const)('%s calls worktrees.%s for the project', async (channel, payload, method, args) => {
    // Arrange
    const { ipc, worktrees } = setup()

    // Act
    const result = await ipc.invoke(channel, { projectId: PROJECT_ID, ...payload })

    // Assert
    expect(result).toEqual({ ok: true, data: { from: method } })
    expect(worktrees[method]).toHaveBeenCalledWith(testProject(), ...args)
  })

  test('fails for an unknown project', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, worktrees } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.worktreeCreate, { projectId: 'missing' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(worktrees.create).not.toHaveBeenCalled()
  })

  test.each([{ projectId: PROJECT_ID, path: 'relative' }, { projectId: PROJECT_ID }])(
    'refuses to remove with the invalid request %j',
    async (payload) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, worktrees } = setup()

      // Act
      const result = await ipc.invoke(IpcChannel.worktreeRemove, payload)

      // Assert
      expect(result).toEqual({ ok: false, error: 'Invalid request.' })
      expect(worktrees.remove).not.toHaveBeenCalled()
    },
  )
})
