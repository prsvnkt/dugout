import { randomBytes, randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, Notification, safeStorage, shell } from 'electron'
import type { AppCommand } from '@shared/commands'
import { IpcChannel } from '@shared/ipc/channels'
import { registerCloneIpc } from './ipc/registerCloneIpc'
import { registerAgentConfigIpc } from './ipc/registerAgentConfigIpc'
import { registerCompareIpc } from './ipc/registerCompareIpc'
import { registerContextIpc } from './ipc/registerContextIpc'
import { AgentConfigService } from './services/agentConfig/AgentConfigService'
import { registerDialogIpc } from './ipc/registerDialogIpc'
import { registerFileIpc } from './ipc/registerFileIpc'
import { registerGitHubIpc } from './ipc/registerGitHubIpc'
import { registerGitIpc } from './ipc/registerGitIpc'
import { registerProjectIpc } from './ipc/registerProjectIpc'
import { registerTerminalIpc } from './ipc/registerTerminalIpc'
import { registerWorkspaceIpc } from './ipc/registerWorkspaceIpc'
import { registerPullRequestIpc } from './ipc/registerPullRequestIpc'
import { registerPreviewIpc } from './ipc/registerPreviewIpc'
import { registerTaskIpc } from './ipc/registerTaskIpc'
import { registerWorktreeIpc } from './ipc/registerWorktreeIpc'
import { registerWelcomeIpc } from './ipc/registerWelcomeIpc'
import { registerOpenInIpc } from './ipc/registerOpenInIpc'
import { registerUsageIpc } from './ipc/registerUsageIpc'
import { registerTimelineIpc } from './ipc/registerTimelineIpc'
import { setupTimeline } from './services/timeline/setupTimeline'
import { OpenInService } from './services/openIn/OpenInService'
import { DEFAULT_OPEN_COMMAND, execFileRunner } from './services/openIn/runOpen'
import { installMenu } from './menu'
import { setupAgentHooks, type AgentHooks } from './services/agentHooks/setupAgentHooks'
import { GitService } from './services/git/GitService'
import { gitHubConfig, GITHUB_SCOPES } from './services/github/config'
import { DeviceFlowClient } from './services/github/DeviceFlowClient'
import { GitHubApi } from './services/github/GitHubApi'
import { GitHubAuth } from './services/github/GitHubAuth'
import { GitHubDeployments } from './services/github/GitHubDeployments'
import { GitHubPullFeedback } from './services/github/GitHubPullFeedback'
import { GitHubPulls } from './services/github/GitHubPulls'
import { gitCredentialConfig } from './services/github/gitCredentials'
import { TokenStore, type Encryption } from './services/github/TokenStore'
import { AgentNotifier, type AgentNotification } from './services/notifications/AgentNotifier'
import { FileService } from './services/files/FileService'
import { resolveRepoRoot } from './services/git/resolveRepoRoot'
import { isPortFree } from './services/preview/portProbe'
import { ProjectStore } from './services/projects/ProjectStore'
import { NodePtyBackend } from './services/terminal/NodePtyBackend'
import { TerminalManager } from './services/terminal/TerminalManager'
import { CheckRunner } from './services/checks/CheckRunner'
import { shellCheckSpawner } from './services/checks/spawnCheck'
import { agentAdapter, agentCommands } from './services/agents/registry'
import { loginShellHeadlessRunner } from './services/agents/runHeadless'
import { buildCodemap } from './services/context/codemap'
import { CONTEXT_RPC_PREFIX, handleContextRpc } from './services/context/contextRpc'
import { ContextStore, type ContextProject } from './services/context/ContextStore'
import { checkoutFolder, diskFolder } from './services/context/entryFolders'
import { loginShellRunner } from './services/welcome/checkAgentClis'
import { SettingsStore } from './services/settings/SettingsStore'
import { registerSettingsIpc } from './ipc/registerSettingsIpc'
import { registerLinearIpc } from './ipc/registerLinearIpc'
import { LinearAuth } from './services/linear/LinearAuth'
import { linearConfig } from './services/linear/linearConfig'
import { LinearIssues } from './services/linear/LinearIssues'
import { LinearKeyStore } from './services/linear/LinearKeyStore'
import { GitHubIssues } from './services/tasks/GitHubIssues'
import { handleTaskRpc } from './services/tasks/taskRpc'
import { TaskService } from './services/tasks/TaskService'
import { LayoutStore } from './services/workspace/LayoutStore'
import { WorktreeManager } from './services/worktrees/WorktreeManager'
import { setupUsage } from './services/usage/setupUsage'
import type { UsageService } from './services/usage/UsageService'
import { createUsageReporter, type TranscriptHint } from './services/usage/usageReporter'
import { SHARED_CONTEXT_DIR } from '@shared/context'
import { createMainWindow } from './window'
import { applyAppIcon } from './appIcon'

const PROJECTS_FILE = 'projects.json'
const WORKTREES_DIR = 'worktrees'
const WORKSPACE_FILE = 'workspace.json'
const GITHUB_TOKEN_FILE = 'github-token.bin'
const LINEAR_KEY_FILE = 'linear-key.bin'
const SETTINGS_FILE = 'settings.json'
/** A Verify on Stop check still running after this is stopped and reported as failed. */
const CHECK_TIMEOUT_MS = 30 * 60_000
/** Private context entries and agents' proposals, per project. */
const CONTEXT_DIR = 'context'
const PROPOSED_DIR = 'proposed'
/** Where macOS apps live, at the root and in the home folder. */
const APPLICATIONS_DIR = '/Applications'

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

// Lets tests (and parallel dev instances) use an isolated data folder. Unpackaged runs default
// to "Dugout Dev" so `npm run dev` never shares projects or the hook socket with the installed app.
const DEV_DATA_FOLDER = 'Dugout Dev'
const userDataOverride =
  process.env.DUGOUT_USER_DATA_DIR ??
  (app.isPackaged ? undefined : join(app.getPath('appData'), DEV_DATA_FOLDER))
if (userDataOverride) app.setPath('userData', userDataOverride)

let agentHooks: AgentHooks | null = null
let terminalManager: TerminalManager | null = null
let checkRunner: CheckRunner | null = null
let usageService: UsageService | null = null
let reportTranscript: ((hint: TranscriptHint) => void) | null = null

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
let taskService: TaskService | null = null
let agentContext: {
  readonly store: ContextStore
  readonly findProject: (id: string) => ContextProject | undefined
} | null = null

/** A context tool call from an agent: scoped to its terminal's project, as task calls are. */
async function handleAgentContextRpc(
  terminalId: string,
  projectId: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  const project = agentContext?.findProject(projectId)
  if (!agentContext || !project) throw new Error('This terminal is not part of a Dugout project.')
  const caller = { project, agent: terminalManager?.agentInfo(terminalId)?.kind ?? null }
  return handleContextRpc(agentContext.store, caller, method, params, () =>
    broadcast(IpcChannel.contextChanged, projectId),
  )
}

/** Tool calls from an agent's "dugout" MCP server: scoped to the project of its terminal. */
async function handleAgentRpc(
  terminalId: string,
  method: string,
  params: unknown,
): Promise<unknown> {
  const projectId = terminalManager?.projectOf(terminalId)
  if (!projectId) throw new Error('This terminal is not part of a Dugout project.')
  if (method.startsWith(CONTEXT_RPC_PREFIX)) {
    return handleAgentContextRpc(terminalId, projectId, method, params)
  }
  if (!taskService) throw new Error('This terminal is not part of a Dugout project.')
  return handleTaskRpc(taskService, projectId, method, params)
}

async function startAgentHooks(dataDir: string): Promise<AgentHooks | null> {
  try {
    return await setupAgentHooks({
      dataDir,
      commands: agentCommands(process.env),
      onSignal: (terminalId, signal, details) => {
        terminalManager?.applyHookSignal(terminalId, signal, details)
        const { transcriptPath, sessionId } = details
        if (transcriptPath)
          reportTranscript?.({ terminalId, transcriptPath, sessionId, isSubagent: false })
      },
      onSubagent: (terminalId, update, transcriptPath) => {
        terminalManager?.applySubagent(terminalId, update)
        if (transcriptPath) reportTranscript?.({ terminalId, transcriptPath, isSubagent: true })
      },
      onRpc: handleAgentRpc,
      // Electron runs the bundled MCP server in Node mode, so users need no separate Node.
      mcpServer: { command: process.execPath, script: join(import.meta.dirname, 'mcp.js') },
    })
  } catch (error) {
    console.error('[hooks] could not start; agent status disabled:', error)
    return null
  }
}

/** Usage is a nice-to-have too: if its folder cannot be set up, agents run without it. */
async function startUsage(dataDir: string, homeDir: string): Promise<UsageService | null> {
  try {
    return await setupUsage({ dataDir, homeDir, env: process.env })
  } catch (error) {
    console.error('[usage] could not start; token usage disabled:', error)
    return null
  }
}

async function start(): Promise<void> {
  applyAppIcon()
  const dataDir = app.getPath('userData')
  const projectStore = new ProjectStore({
    filePath: join(dataDir, PROJECTS_FILE),
    createId: randomUUID,
    now: () => new Date(),
    random: Math.random,
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
  const checks = new CheckRunner({
    spawn: shellCheckSpawner(process.env),
    checkCommand: (id) => projectStore.list().find((project) => project.id === id)?.checkCommand,
    now: () => Date.now(),
    timeoutMs: CHECK_TIMEOUT_MS,
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs)
      return () => clearTimeout(timer)
    },
  })
  checkRunner = checks

  // Tests point this at a temp folder so they never search the real home folder.
  const homeDir = process.env.DUGOUT_HOME_DIR ?? homedir()
  usageService = await startUsage(dataDir, homeDir)
  if (usageService) {
    reportTranscript = createUsageReporter({
      usage: usageService,
      terminals: manager,
      onProjectChange: (projectId) => broadcast(IpcChannel.usageChanged, projectId),
    })
  }

  registerUsageIpc(usageService)
  registerTimelineIpc(setupTimeline({ homeDir, env: process.env }))
  registerProjectIpc(projectStore)
  const github = gitHubConfig(process.env)
  const githubApi = new GitHubApi({ fetch, apiBaseUrl: github.apiBaseUrl })
  const githubAuth = new GitHubAuth({
    isConfigured: github.clientId !== '',
    now: () => Date.now(),
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
    schedule: (run, delayMs) => {
      const timer = setTimeout(run, delayMs)
      return () => clearTimeout(timer)
    },
  })
  void githubAuth.init().catch((error: unknown) => console.error('[github] init failed:', error))

  const git = new GitService({
    env: process.env,
    credentials: async () =>
      gitCredentialConfig(await githubAuth.freshToken().catch(() => null), github.webBaseUrl),
  })
  const files = new FileService({ git })
  const worktrees = new WorktreeManager({
    git,
    files,
    baseDir: join(dataDir, WORKTREES_DIR),
    createId: () => randomBytes(WORKTREE_ID_BYTES).toString('hex'),
  })
  const linear = linearConfig(process.env)
  const linearIssues = new LinearIssues({ fetch, apiUrl: linear.apiUrl })
  const linearAuth = new LinearAuth({
    store: new LinearKeyStore({
      filePath: join(dataDir, LINEAR_KEY_FILE),
      encryption: tokenEncryption,
    }),
    viewer: (apiKey) => linearIssues.viewer(apiKey),
  })
  registerLinearIpc({ auth: linearAuth, issues: linearIssues })
  registerTerminalIpc(manager, checks, worktrees)
  taskService = new TaskService({
    findProject: (id) => projectStore.list().find((project) => project.id === id),
    remoteUrl: (root) => git.remoteUrl(root),
    github: {
      withToken: (call) => githubAuth.withToken(call),
      issues: new GitHubIssues({ fetch, apiBaseUrl: github.apiBaseUrl }),
      webBaseUrl: github.webBaseUrl,
    },
    linear: {
      withKey: (call) => linearAuth.withKey(call),
      issues: linearIssues,
      webOrigin: linear.webOrigin,
    },
  })
  const tasks = taskService
  const githubBranch = {
    projects: projectStore,
    worktrees,
    git,
    auth: githubAuth,
    webBaseUrl: github.webBaseUrl,
  }
  registerPullRequestIpc({
    ...githubBranch,
    pulls: new GitHubPulls({ fetch, apiBaseUrl: github.apiBaseUrl }),
    feedback: new GitHubPullFeedback({ fetch, apiBaseUrl: github.apiBaseUrl }),
    openExternal: (url) => shell.openExternal(url),
  })
  registerPreviewIpc({
    ...githubBranch,
    deployments: new GitHubDeployments({ fetch, apiBaseUrl: github.apiBaseUrl }),
    isPortFree,
    openExternal: (url) => shell.openExternal(url),
  })
  registerTaskIpc({
    tasks,
    projects: projectStore,
    worktrees,
    openExternal: (url) => shell.openExternal(url),
  })
  registerGitIpc({
    taskKey: (projectId, taskNumber) => tasks.keyFor(projectId, taskNumber),
    onTaskPullRequest: (projectId, taskNumber) => {
      tasks
        .update(projectId, taskNumber, { status: 'in-review' })
        .catch((error: unknown) => console.warn('[tasks] could not mark in review:', error))
    },
    projects: projectStore,
    git,
    worktrees,
    openExternal: (url) => shell.openExternal(url),
  })
  registerWorktreeIpc(projectStore, worktrees)
  registerCompareIpc(projectStore, worktrees, git)
  registerAgentConfigIpc(projectStore, new AgentConfigService())
  registerGitHubIpc({
    auth: githubAuth,
    api: githubApi,
    webBaseUrl: github.webBaseUrl,
    openExternal: (url) => shell.openExternal(url),
  })
  registerFileIpc(projectStore, worktrees, files)
  const contextStore = new ContextStore({
    folder: (project, kind) => {
      if (kind === 'shared') return checkoutFolder(files, project.rootPath, SHARED_CONTEXT_DIR)
      const privateDir = join(dataDir, CONTEXT_DIR, project.id)
      return diskFolder(kind === 'proposed' ? join(privateDir, PROPOSED_DIR) : privateDir)
    },
    hashPath: (root, path) => files.hashPath(root, path),
    now: () => new Date(),
  })
  agentContext = {
    store: contextStore,
    findProject: (id) => projectStore.list().find((project) => project.id === id),
  }
  const runHeadless = loginShellHeadlessRunner(process.env)
  registerContextIpc({
    projects: projectStore,
    store: contextStore,
    buildCodemap: (agent, root) =>
      buildCodemap(
        { adapter: agentAdapter, commands: agentCommands(process.env), run: runHeadless },
        agent,
        root,
      ),
  })
  const settings = new SettingsStore({ filePath: join(dataDir, SETTINGS_FILE) })
  registerCloneIpc(git, settings, homeDir)
  registerSettingsIpc(settings)
  registerOpenInIpc(
    projectStore,
    worktrees,
    new OpenInService({
      applicationDirs: [APPLICATIONS_DIR, join(homedir(), APPLICATIONS_DIR)],
      runOpen: execFileRunner(process.env.DUGOUT_OPEN_COMMAND ?? DEFAULT_OPEN_COMMAND),
      settings,
    }),
  )
  registerWelcomeIpc({
    settings,
    homeDir,
    runInLoginShell: loginShellRunner(process.env),
    agentCommands: agentCommands(process.env),
  })
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
  checkRunner?.stopAll()
  // Best effort: anything not saved is replayed from the usage ledger on the next start.
  void usageService?.flush()
  void agentHooks?.close()
})
