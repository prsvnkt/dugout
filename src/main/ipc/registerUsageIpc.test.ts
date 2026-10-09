import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import { FakeIpcMain, PROJECT_ID, silenceIpcLogs } from './fakeIpcMain'
import { registerUsageIpc } from './registerUsageIpc'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerUsageIpc', () => {
  test('registers the usage channel', () => {
    // Arrange
    const ipc = new FakeIpcMain()

    // Act
    registerUsageIpc(null, ipc)

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.usageProject])
  })

  test("returns the project's usage", async () => {
    // Arrange
    const ipc = new FakeIpcMain()
    const projectUsage = vi.fn(async () => ({ totalTokens: 1200 }))
    registerUsageIpc({ projectUsage } as never, ipc)

    // Act
    const result = await ipc.invoke(IpcChannel.usageProject, { projectId: PROJECT_ID })

    // Assert
    expect(projectUsage).toHaveBeenCalledWith(PROJECT_ID)
    expect(result).toEqual({ ok: true, data: { totalTokens: 1200 } })
  })

  test('fails readably when the ledger could not be set up', async () => {
    // Arrange
    silenceIpcLogs()
    const ipc = new FakeIpcMain()
    registerUsageIpc(null, ipc)

    // Act
    const result = await ipc.invoke(IpcChannel.usageProject, { projectId: PROJECT_ID })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Token usage is unavailable.' })
  })

  test('rejects an invalid request', async () => {
    // Arrange
    silenceIpcLogs()
    const ipc = new FakeIpcMain()
    const projectUsage = vi.fn()
    registerUsageIpc({ projectUsage } as never, ipc)

    // Act
    const result = await ipc.invoke(IpcChannel.usageProject, { projectId: '' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(projectUsage).not.toHaveBeenCalled()
  })
})
