import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { OpenInService } from '../services/openIn/OpenInService'
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
import { registerOpenInIpc } from './registerOpenInIpc'

function setup() {
  const openIn = {
    apps: vi.fn(async () => ({ installed: ['zed', 'finder'], lastUsed: 'zed' })),
    open: vi.fn(async () => {}),
  }
  const worktrees = fakeWorktrees()
  const ipc = new FakeIpcMain()
  registerOpenInIpc(fakeProjects(), worktrees.manager, openIn as unknown as OpenInService, ipc)
  return { ipc, openIn, resolveCheckout: worktrees.resolveCheckout }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerOpenInIpc', () => {
  test('registers the Open in channels', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.openInApps, IpcChannel.openInOpen].sort())
  })

  test('lists the installed apps', async () => {
    // Arrange
    const { ipc } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.openInApps)

    // Assert
    expect(result).toEqual({ ok: true, data: { installed: ['zed', 'finder'], lastUsed: 'zed' } })
  })

  test.each([
    ['the main checkout', undefined, PROJECT_ROOT],
    ['a managed worktree', MANAGED_WORKTREE, MANAGED_WORKTREE],
  ])('opens %s, as resolved by main', async (_case, worktreePath, folder) => {
    // Arrange
    const { ipc, openIn, resolveCheckout } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.openInOpen, {
      projectId: PROJECT_ID,
      worktreePath,
      app: 'vscode',
    })

    // Assert
    expect(result).toEqual({ ok: true, data: undefined })
    expect(openIn.open).toHaveBeenCalledWith('vscode', folder)
    expect(resolveCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      openIn.open.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test('never opens a folder that is not a managed worktree', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openIn } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.openInOpen, {
      projectId: PROJECT_ID,
      worktreePath: UNMANAGED_FOLDER,
      app: 'finder',
    })

    // Assert
    expect(result).toEqual({ ok: false, error: 'That folder is not a worktree of this project.' })
    expect(openIn.open).not.toHaveBeenCalled()
  })

  test('fails for an unknown project', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openIn } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.openInOpen, { projectId: 'missing', app: 'zed' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(openIn.open).not.toHaveBeenCalled()
  })

  test.each([
    { projectId: PROJECT_ID, app: 'Terminal' },
    { projectId: PROJECT_ID, app: 'zed', worktreePath: 'relative' },
    { app: 'zed' },
  ])('rejects the invalid request %j', async (payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openIn, resolveCheckout } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.openInOpen, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(resolveCheckout).not.toHaveBeenCalled()
    expect(openIn.open).not.toHaveBeenCalled()
  })
})
