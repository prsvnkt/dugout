import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'
import type { IpcMainLike } from './handle'

/** The native folder picker, attached to the asking window; null when cancelled. */
async function showFolderDialog(event: IpcMainInvokeEvent): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const options = { properties: ['openDirectory' as const] }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

export function registerDialogIpc(
  pickFolder: (event: IpcMainInvokeEvent) => Promise<string | null> = showFolderDialog,
  ipc: IpcMainLike = ipcMain,
): void {
  ipc.handle(IpcChannel.dialogPickFolder, (event) => pickFolder(event))
}
