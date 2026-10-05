import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import type { AppCommand } from '@shared/commands'
import { IpcChannel } from '@shared/ipc/channels'
import { registerDialogIpc } from './ipc/registerDialogIpc'
import { registerProjectIpc } from './ipc/registerProjectIpc'
import { registerTerminalIpc } from './ipc/registerTerminalIpc'
import { installMenu } from './menu'
import { setupAgentHooks, type AgentHooks } from './services/agentHooks/setupAgentHooks'
import { resolveRepoRoot } from './services/git/resolveRepoRoot'
import { ProjectStore } from './services/projects/ProjectStore'
import { NodePtyBackend } from './services/terminal/NodePtyBackend'
import { TerminalManager } from './services/terminal/TerminalManager'
import { createMainWindow } from './window'

const PROJECTS_FILE = 'projects.json'

// Lets tests (and parallel dev instances) use an isolated data folder.
const userDataOverride = process.env.DUGOUT_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

let agentHooks: AgentHooks | null = null
let terminalManager: TerminalManager | null = null

function sendCommand(command: AppCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannel.appCommand, command)
}

function updateDockBadge(manager: TerminalManager): void {
  const waiting = manager.countAgentsWithStatus('needs-input')
  app.dock?.setBadge(waiting > 0 ? String(waiting) : '')
}

/** Status is a nice-to-have: if hooks cannot start, terminals still work without it. */
async function startAgentHooks(dataDir: string): Promise<AgentHooks | null> {
  try {
    return await setupAgentHooks({
      dataDir,
      claudeCommand: process.env.DUGOUT_CLAUDE_COMMAND,
      onSignal: (terminalId, signal) => terminalManager?.applyHookSignal(terminalId, signal),
    })
  } catch (error) {
    console.error('[hooks] could not start; agent status disabled:', error)
    return null
  }
}

async function start(): Promise<void> {
  const dataDir = app.getPath('userData')
  agentHooks = await startAgentHooks(dataDir)
  const manager = new TerminalManager({
    backend: new NodePtyBackend(),
    createId: randomUUID,
    env: process.env,
    ...(agentHooks && { agentHooks: agentHooks.config }),
    onAgentStatusChange: () => updateDockBadge(manager),
  })
  terminalManager = manager

  const projectStore = new ProjectStore({
    filePath: join(dataDir, PROJECTS_FILE),
    createId: randomUUID,
    now: () => new Date(),
    resolveRepoRoot,
  })
  await projectStore.load()

  registerTerminalIpc(manager)
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

app.on('before-quit', () => {
  terminalManager?.killAll()
  void agentHooks?.close()
})
