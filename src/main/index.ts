import { randomUUID } from 'node:crypto'
import { app, BrowserWindow } from 'electron'
import { registerDialogIpc } from './ipc/registerDialogIpc'
import { registerTerminalIpc } from './ipc/registerTerminalIpc'
import { NodePtyBackend } from './services/terminal/NodePtyBackend'
import { TerminalManager } from './services/terminal/TerminalManager'
import { createMainWindow } from './window'

const terminalManager = new TerminalManager({
  backend: new NodePtyBackend(),
  createId: randomUUID,
  env: process.env,
})

app.whenReady().then(() => {
  registerTerminalIpc(terminalManager)
  registerDialogIpc()
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => terminalManager.killAll())
