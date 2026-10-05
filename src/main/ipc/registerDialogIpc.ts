import { BrowserWindow, dialog, ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'

export function registerDialogIpc(): void {
  ipcMain.handle(IpcChannel.dialogPickFolder, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    const options = { properties: ['openDirectory' as const] }
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
}
