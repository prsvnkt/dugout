import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'
import { installMenu } from './menu'
import { agentCommands } from './services/agents/registry'
import { resolveRepoRoot } from './services/git/resolveRepoRoot'
import { ProjectStore } from './services/projects/ProjectStore'
import { createMainWindow } from './window'
import { describeOverrides, readOverrides } from './devOverrides'
import { applyAppIcon } from './appIcon'
import { sendCommand, tokenEncryption, type AppEnv } from './compose/appEnv'
import { composeContext } from './compose/composeContext'
import { registerFileScheme, serveFileProtocol } from './compose/composeFileProtocol'
import { composeGit } from './compose/composeGit'
import { composeGithub } from './compose/composeGithub'
import { composeTasks } from './compose/composeTasks'
import { composeTerminal, type TerminalServices } from './compose/composeTerminal'
import { composeUsage } from './compose/composeUsage'
import { registerAllIpc, type AppServices } from './compose/registerIpc'
import { guardUnsavedChanges, trackUnsavedChanges } from './compose/unsavedChanges'

const PROJECTS_FILE = 'projects.json'

/**
 * Test and dev overrides from the environment. A packaged app ignores them unless DUGOUT_E2E=1
 * (decision 060); read them nowhere else.
 */
const overrides = readOverrides(process.env, { isPackaged: app.isPackaged })
const overridesNotice = describeOverrides(overrides)
if (overridesNotice) console.warn(overridesNotice)

// Lets tests (and parallel dev instances) use an isolated data folder. Unpackaged runs default
// to "Dugout Dev" so `npm run dev` never shares projects or the hook socket with the installed app.
const DEV_DATA_FOLDER = 'Dugout Dev'
const userDataOverride =
  overrides.userDataDir ??
  (app.isPackaged ? undefined : join(app.getPath('appData'), DEV_DATA_FOLDER))
if (userDataOverride) app.setPath('userData', userDataOverride)

trackUnsavedChanges()
// The viewers' file scheme must be privileged before the app is ready (decision 067).
registerFileScheme()

function appEnv(): AppEnv {
  return {
    dataDir: app.getPath('userData'),
    // Tests point this at a temp folder so they never search the real home folder.
    homeDir: overrides.homeDir ?? homedir(),
    overrides,
    commands: agentCommands(overrides.agentCommands),
    encryption: tokenEncryption(overrides.insecureTokenStorage),
  }
}

async function loadProjects(dataDir: string): Promise<ProjectStore> {
  const projects = new ProjectStore({
    filePath: join(dataDir, PROJECTS_FILE),
    createId: randomUUID,
    now: () => new Date(),
    random: Math.random,
    resolveRepoRoot,
  })
  await projects.load()
  return projects
}

/** Builds every service, leaf first: GitHub, git, tasks, context, usage, then terminals. */
async function composeServices(env: AppEnv): Promise<AppServices> {
  const projects = await loadProjects(env.dataDir)
  const github = composeGithub(env)
  const repo = composeGit(env, github)
  const tasks = composeTasks(env, { projects, git: repo.git, github })
  const context = composeContext(env, repo.files)
  const usage = await composeUsage(env)
  const terminal = await composeTerminal(env, {
    projects,
    usage,
    tasks: tasks.tasks,
    context,
  })
  return { projects, github, repo, tasks, context, usage, terminal }
}

function stopOnQuit({ manager, checks, hooks }: TerminalServices, usage: AppServices['usage']) {
  app.on('before-quit', () => {
    manager.killAll()
    checks.stopAll()
    // Best effort: anything not saved is replayed from the usage ledger on the next start.
    void usage?.flush()
    void hooks?.close()
  })
}

function openWindow(): void {
  guardUnsavedChanges(createMainWindow(overrides.rendererUrl))
}

async function start(): Promise<void> {
  applyAppIcon()
  const env = appEnv()
  const services = await composeServices(env)
  stopOnQuit(services.terminal, services.usage)
  registerAllIpc(env, services)
  serveFileProtocol(services.projects, services.repo)
  installMenu(sendCommand, !app.isPackaged)
  openWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
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
