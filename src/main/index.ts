import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { AppCommand } from '@shared/commands'
import { IpcChannel } from '@shared/ipc/channels'
import { registerDialogIpc } from './ipc/registerDialogIpc'
import { registerProjectIpc } from './ipc/registerProjectIpc'
import { registerTerminalIpc } from './ipc/registerTerminalIpc'
import { installMenu } from './menu'
import { resolveRepoRoot } from './services/git/resolveRepoRoot'
import { ProjectStore } from './services/projects/ProjectStore'
import { NodePtyBackend } from './services/terminal/NodePtyBackend'
import { TerminalManager } from './services/terminal/TerminalManager'
import { createMainWindow } from './window'

const PROJECTS_FILE = 'projects.json'

// Lets tests (and parallel dev instances) use an isolated data folder.
const userDataOverride = process.env.DUGOUT_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

const terminalManager = new TerminalManager({
  backend: new NodePtyBackend(),
  createId: randomUUID,
  env: process.env,
})

function sendCommand(command: AppCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannel.appCommand, command)
}

async function start(): Promise<void> {
  const projectStore = new ProjectStore({
    filePath: join(app.getPath('userData'), PROJECTS_FILE),
    createId: randomUUID,
    now: () => new Date(),
    resolveRepoRoot,
  })
  await projectStore.load()

  registerTerminalIpc(terminalManager)
  registerProjectIpc(projectStore)
  registerDialogIpc()
  installMenu(sendCommand, !app.isPackaged)
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
}

app
  .whenReady()
  .then(start)
  .catch((error: unknown) => {
    console.error('[app] failed to start:', error)
    app.exit(1)
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => terminalManager.killAll())
