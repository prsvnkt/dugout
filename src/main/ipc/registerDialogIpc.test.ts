import { describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import { FakeIpcMain, fakeSender } from './fakeIpcMain'
import { registerDialogIpc } from './registerDialogIpc'

describe('registerDialogIpc', () => {
  test('registers the folder picker channel', () => {
    // Arrange
    const ipc = new FakeIpcMain()

    // Act
    registerDialogIpc(async () => null, ipc)

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.dialogPickFolder])
  })

  test('returns the folder the user picked, asking for the window that asked', async () => {
    // Arrange
    const ipc = new FakeIpcMain()
    const pickFolder = vi.fn(async () => '/Users/me/code/demo')
    registerDialogIpc(pickFolder, ipc)
    const sender = fakeSender(3)

    // Act
    const folder = await ipc.invokeRaw(IpcChannel.dialogPickFolder, undefined, sender)

    // Assert
    expect(folder).toBe('/Users/me/code/demo')
    expect(pickFolder).toHaveBeenCalledWith(expect.objectContaining({ sender }))
  })

  test('returns null when the user cancels', async () => {
    // Arrange
    const ipc = new FakeIpcMain()
    registerDialogIpc(async () => null, ipc)

    // Act
    const folder = await ipc.invokeRaw(IpcChannel.dialogPickFolder)

    // Assert
    expect(folder).toBeNull()
  })
})
