import { dialog, ipcMain, type BrowserWindow } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'

const windowsWithUnsavedChanges = new Set<number>()

/** Tracks which windows' editors report unsaved changes. Call once, before any window opens. */
export function trackUnsavedChanges(): void {
  ipcMain.on(IpcChannel.editorUnsavedChanges, (event, hasUnsavedChanges: unknown) => {
    if (hasUnsavedChanges === true) windowsWithUnsavedChanges.add(event.sender.id)
    else windowsWithUnsavedChanges.delete(event.sender.id)
  })
}

/** Asks before closing a window (or quitting) while the editor has unsaved changes. */
export function guardUnsavedChanges(window: BrowserWindow): void {
  const contentsId = window.webContents.id
  window.on('close', (event) => {
    if (!windowsWithUnsavedChanges.has(contentsId)) return
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Discard Changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'You have unsaved changes.',
      detail: 'Your edits will be lost if you close without saving.',
    })
    if (choice === 1) event.preventDefault()
    else windowsWithUnsavedChanges.delete(contentsId)
  })
}
