import { randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell } from 'electron'
import type { AppCommand } from '@shared/commands'
import { IpcChannel } from '@shared/ipc/channels'
import { registerDialogIpc } from './ipc/registerDialogIpc'
import { registerFileIpc } from './ipc/registerFileIpc'
import { registerGitHubIpc } from './ipc/registerGitHubIpc'
import { registerGitIpc } from './ipc/registerGitIpc'
import { registerProjectIpc } from './ipc/registerProjectIpc'
import { registerTerminalIpc } from './ipc/registerTerminalIpc'
import { registerWorkspaceIpc } from './ipc/registerWorkspaceIpc'
import { registerWorktreeIpc } from './ipc/registerWorktreeIpc'
import { installMenu } from './menu'
import { setupAgentHooks, type AgentHooks } from './services/agentHooks/setupAgentHooks'
import { GitService } from './services/git/GitService'
import { gitHubConfig, GITHUB_SCOPES } from './services/github/config'
import { DeviceFlowClient } from './services/github/DeviceFlowClient'
import { GitHubApi } from './services/github/GitHubApi'
import { GitHubAuth } from './services/github/GitHubAuth'
import { gitCredentialConfig } from './services/github/gitCredentials'
import { TokenStore, type Encryption } from './services/github/TokenStore'
import { AgentNotifier, type AgentNotification } from './services/notifications/AgentNotifier'
import { FileService } from './services/files/FileService'
import { resolveRepoRoot } from './services/git/resolveRepoRoot'
import { ProjectStore } from './services/projects/ProjectStore'
import { NodePtyBackend } from './services/terminal/NodePtyBackend'
import { TerminalManager } from './services/terminal/TerminalManager'
import { LayoutStore } from './services/workspace/LayoutStore'
import { WorktreeManager } from './services/worktrees/WorktreeManager'
import { createMainWindow } from './window'

const PROJECTS_FILE = 'projects.json'
const WORKTREES_DIR = 'worktrees'
const WORKSPACE_FILE = 'workspace.json'
const GITHUB_TOKEN_FILE = 'github-token.bin'

/**
 * safeStorage is Keychain-backed on macOS. E2E tests opt into a plaintext stand-in so they never
 * trigger Keychain prompts; the variable name makes the trade-off explicit.
 */
const tokenEncryption: Encryption =
  process.env.DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS === '1'
    ? {
        isAvailable: () => true,
        encrypt: (text) => Buffer.from(text, 'utf8'),
        decrypt: (data) => data.toString('utf8'),
      }
    : {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: (text) => safeStorage.encryptString(text),
        decrypt: (data) => safeStorage.decryptString(data),
      }

function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args)
}
const WORKTREE_ID_BYTES = 3

// Lets tests (and parallel dev instances) use an isolated data folder.
const userDataOverride = process.env.DUGOUT_USER_DATA_DIR
if (userDataOverride) app.setPath('userData', userDataOverride)

let agentHooks: AgentHooks | null = null
let terminalManager: TerminalManager | null = null

function sendCommand(command: AppCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannel.appCommand, command)
}

function showNotification({ terminalId, title, body }: AgentNotification): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title, body })
  notification.on('click', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
    sendCommand({ type: 'terminal.reveal', terminalId })
  })
  notification.show()
}

const windowsWithUnsavedChanges = new Set<number>()

ipcMain.on(IpcChannel.editorUnsavedChanges, (event, hasUnsavedChanges: unknown) => {
  if (hasUnsavedChanges === true) windowsWithUnsavedChanges.add(event.sender.id)
  else windowsWithUnsavedChanges.delete(event.sender.id)
})

/** Asks before closing a window (or quitting) while the editor has unsaved changes. */
function guardUnsavedChanges(window: BrowserWindow): void {
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
      onSignal: (terminalId, signal, details) =>
        terminalManager?.applyHookSignal(terminalId, signal, details),
    })
  } catch (error) {
    console.error('[hooks] could not start; agent status disabled:', error)
    return null
  }
}

async function start(): Promise<void> {
  const dataDir = app.getPath('userData')
  const projectStore = new ProjectStore({
    filePath: join(dataDir, PROJECTS_FILE),
    createId: randomUUID,
    now: () => new Date(),
    resolveRepoRoot,
  })
  await projectStore.load()

  const notifier = new AgentNotifier({
    isAppFocused: () => BrowserWindow.getFocusedWindow() !== null,
    projectName: (id) => projectStore.list().find((project) => project.id === id)?.name,
    show: showNotification,
  })

  agentHooks = await startAgentHooks(dataDir)
  const manager = new TerminalManager({
    backend: new NodePtyBackend(),
    createId: randomUUID,
    env: process.env,
    ...(agentHooks && { agentHooks: agentHooks.config }),
    onAgentStatusChange: (change) => {
      updateDockBadge(manager)
      notifier.handle(change)
    },
  })
  terminalManager = manager

  registerTerminalIpc(manager)
  registerProjectIpc(projectStore)
  const github = gitHubConfig(process.env)
  const githubApi = new GitHubApi({ fetch, apiBaseUrl: github.apiBaseUrl })
  const githubAuth = new GitHubAuth({
    isConfigured: github.clientId !== '',
    deviceFlow: new DeviceFlowClient({
      fetch,
      webBaseUrl: github.webBaseUrl,
      clientId: github.clientId,
      scopes: GITHUB_SCOPES,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    }),
    tokens: new TokenStore({
      filePath: join(dataDir, GITHUB_TOKEN_FILE),
      encryption: tokenEncryption,
    }),
    api: githubApi,
    onChange: (state) => broadcast(IpcChannel.authState, state),
  })
  void githubAuth.init().catch((error: unknown) => console.error('[github] init failed:', error))

  const git = new GitService({
    env: process.env,
    credentials: () => gitCredentialConfig(githubAuth.token(), github.webBaseUrl),
  })
  const worktrees = new WorktreeManager({
    git,
    baseDir: join(dataDir, WORKTREES_DIR),
    createId: () => randomBytes(WORKTREE_ID_BYTES).toString('hex'),
  })
  registerGitIpc({
    projects: projectStore,
    git,
    worktrees,
    openExternal: (url) => shell.openExternal(url),
  })
  registerWorktreeIpc(projectStore, worktrees)
  registerGitHubIpc({
    auth: githubAuth,
    api: githubApi,
    webBaseUrl: github.webBaseUrl,
    openExternal: (url) => shell.openExternal(url),
  })
  registerFileIpc(projectStore, worktrees, new FileService({ git }))
  registerWorkspaceIpc(new LayoutStore({ filePath: join(dataDir, WORKSPACE_FILE) }), projectStore)
  registerDialogIpc()
  installMenu(sendCommand, !app.isPackaged)
  guardUnsavedChanges(createMainWindow())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) guardUnsavedChanges(createMainWindow())
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
