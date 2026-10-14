import { homedir } from 'node:os'
import { join } from 'node:path'
import { registerAgentConfigIpc } from '../ipc/registerAgentConfigIpc'
import { registerCloneIpc } from '../ipc/registerCloneIpc'
import { registerCompareIpc } from '../ipc/registerCompareIpc'
import { registerContextIpc } from '../ipc/registerContextIpc'
import { registerDialogIpc } from '../ipc/registerDialogIpc'
import { registerFileIpc } from '../ipc/registerFileIpc'
import { registerGitHubIpc } from '../ipc/registerGitHubIpc'
import { registerGitIpc } from '../ipc/registerGitIpc'
import { registerLinearIpc } from '../ipc/registerLinearIpc'
import { registerOpenInIpc } from '../ipc/registerOpenInIpc'
import { registerPreviewIpc } from '../ipc/registerPreviewIpc'
import { registerProjectIpc } from '../ipc/registerProjectIpc'
import { registerPullRequestIpc } from '../ipc/registerPullRequestIpc'
import { registerSettingsIpc } from '../ipc/registerSettingsIpc'
import { registerTaskIpc } from '../ipc/registerTaskIpc'
import { registerTerminalIpc } from '../ipc/registerTerminalIpc'
import { registerTimelineIpc } from '../ipc/registerTimelineIpc'
import { registerUsageIpc } from '../ipc/registerUsageIpc'
import { registerWelcomeIpc } from '../ipc/registerWelcomeIpc'
import { registerWorkspaceIpc } from '../ipc/registerWorkspaceIpc'
import { registerWorktreeIpc } from '../ipc/registerWorktreeIpc'
import { AgentConfigService } from '../services/agentConfig/AgentConfigService'
import { agentAdapter } from '../services/agents/registry'
import { loginShellHeadlessRunner } from '../services/agents/runHeadless'
import { buildCodemap } from '../services/context/codemap'
import type { ContextStore } from '../services/context/ContextStore'
import { GitHubDeployments } from '../services/github/GitHubDeployments'
import { GitHubPullFeedback } from '../services/github/GitHubPullFeedback'
import { GitHubPulls } from '../services/github/GitHubPulls'
import { OpenInService } from '../services/openIn/OpenInService'
import { DEFAULT_OPEN_COMMAND, execFileRunner } from '../services/openIn/runOpen'
import { isPortFree } from '../services/preview/portProbe'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { SettingsStore } from '../services/settings/SettingsStore'
import { setupTimeline } from '../services/timeline/setupTimeline'
import type { UsageService } from '../services/usage/UsageService'
import { loginShellRunner } from '../services/welcome/checkAgentClis'
import { LayoutStore } from '../services/workspace/LayoutStore'
import { openExternal, type AppEnv } from './appEnv'
import type { GitServices } from './composeGit'
import type { GithubServices } from './composeGithub'
import type { TaskServices } from './composeTasks'
import type { TerminalServices } from './composeTerminal'

const WORKSPACE_FILE = 'workspace.json'
const SETTINGS_FILE = 'settings.json'
/** Where macOS apps live, at the root and in the home folder. */
const APPLICATIONS_DIR = '/Applications'

/** Everything start() built, as the IPC handlers need it. */
export interface AppServices {
  readonly projects: ProjectStore
  readonly github: GithubServices
  readonly repo: GitServices
  readonly tasks: TaskServices
  readonly context: ContextStore
  readonly usage: UsageService | null
  readonly terminal: TerminalServices
}

/** Terminals, and what agents read and report: usage, timelines, context, MCP config. */
function registerAgentIpc(env: AppEnv, services: AppServices): void {
  const { projects, terminal, repo } = services
  registerUsageIpc(services.usage)
  registerTimelineIpc(setupTimeline({ homeDir: env.homeDir, env: process.env }))
  registerTerminalIpc(terminal.manager, terminal.checks, repo.worktrees)
  const runHeadless = loginShellHeadlessRunner(process.env)
  registerContextIpc({
    projects,
    store: services.context,
    buildCodemap: (agent, root) =>
      buildCodemap(
        { adapter: agentAdapter, commands: env.commands, run: runHeadless },
        agent,
        root,
      ),
  })
  registerAgentConfigIpc(projects, new AgentConfigService(repo.files))
}

/** GitHub sign-in, pull requests and preview deployments. */
function registerGitHubDomainIpc(services: AppServices): void {
  const { github, repo } = services
  const { apiBaseUrl, webBaseUrl } = github.config
  const githubBranch = {
    projects: services.projects,
    worktrees: repo.worktrees,
    git: repo.git,
    auth: github.auth,
    webBaseUrl,
  }
  registerPullRequestIpc({
    ...githubBranch,
    pulls: new GitHubPulls({ fetch, apiBaseUrl }),
    feedback: new GitHubPullFeedback({ fetch, apiBaseUrl }),
    openExternal,
  })
  registerPreviewIpc({
    ...githubBranch,
    deployments: new GitHubDeployments({ fetch, apiBaseUrl }),
    isPortFree,
    openExternal,
  })
  registerGitHubIpc({ auth: github.auth, api: github.api, webBaseUrl, openExternal })
}

/** The checkout: git review, worktrees, compare, files, and the tasks tied to branches. */
function registerRepoIpc(services: AppServices): void {
  const { projects, repo } = services
  const { tasks } = services.tasks
  registerLinearIpc(services.tasks.linear)
  registerTaskIpc({ tasks, projects, worktrees: repo.worktrees, openExternal })
  registerGitIpc({
    taskKey: (projectId, taskNumber) => tasks.keyFor(projectId, taskNumber),
    onTaskPullRequest: (projectId, taskNumber) => {
      tasks
        .update(projectId, taskNumber, { status: 'in-review' })
        .catch((error: unknown) => console.warn('[tasks] could not mark in review:', error))
    },
    projects,
    git: repo.git,
    worktrees: repo.worktrees,
    openExternal,
  })
  registerWorktreeIpc(projects, repo.worktrees)
  registerCompareIpc(projects, repo.worktrees, repo.git)
  registerFileIpc(projects, repo.worktrees, repo.files)
}

/** Projects, settings, the welcome screen, saved layouts and dialogs. */
function registerAppIpc(env: AppEnv, services: AppServices): void {
  const { projects, repo } = services
  registerProjectIpc(projects)
  const settings = new SettingsStore({ filePath: join(env.dataDir, SETTINGS_FILE) })
  registerCloneIpc(repo.git, settings, env.homeDir)
  registerSettingsIpc(settings)
  registerOpenInIpc(
    projects,
    repo.worktrees,
    new OpenInService({
      applicationDirs: [APPLICATIONS_DIR, join(homedir(), APPLICATIONS_DIR)],
      runOpen: execFileRunner(env.overrides.openCommand ?? DEFAULT_OPEN_COMMAND),
      settings,
    }),
  )
  registerWelcomeIpc({
    settings,
    homeDir: env.homeDir,
    runInLoginShell: loginShellRunner(process.env),
    agentCommands: env.commands,
  })
  registerWorkspaceIpc(new LayoutStore({ filePath: join(env.dataDir, WORKSPACE_FILE) }), projects)
  registerDialogIpc()
}

/** Every request handler the renderer can call, one register*Ipc per domain. */
export function registerAllIpc(env: AppEnv, services: AppServices): void {
  registerAgentIpc(env, services)
  registerGitHubDomainIpc(services)
  registerRepoIpc(services)
  registerAppIpc(env, services)
}
