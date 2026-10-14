import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { app, BrowserWindow, Notification } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'
import { createAgentRpc, type AgentRpcHandler } from '../services/agentHooks/agentRpc'
import { setupAgentHooks, type AgentHooks } from '../services/agentHooks/setupAgentHooks'
import { CheckRunner } from '../services/checks/CheckRunner'
import { shellCheckSpawner } from '../services/checks/spawnCheck'
import type { ContextStore } from '../services/context/ContextStore'
import { AgentNotifier, type AgentNotification } from '../services/notifications/AgentNotifier'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { TaskService } from '../services/tasks/TaskService'
import { NodePtyBackend } from '../services/terminal/NodePtyBackend'
import { TerminalManager } from '../services/terminal/TerminalManager'
import { createUsageReporter, type TranscriptHint } from '../services/usage/usageReporter'
import type { UsageService } from '../services/usage/UsageService'
import { broadcast, findProject, schedule, sendCommand, type AppEnv } from './appEnv'

/** A Verify on Stop check still running after this is stopped and reported as failed. */
const CHECK_TIMEOUT_MS = 30 * 60_000

export interface TerminalDeps {
  readonly projects: ProjectStore
  readonly usage: UsageService | null
  readonly tasks: TaskService
  readonly context: ContextStore
}

export interface TerminalServices {
  /** Null when the hook server could not start: terminals then run without agent status. */
  readonly hooks: AgentHooks | null
  readonly manager: TerminalManager
  readonly checks: CheckRunner
}

/** What the hook server reports, routed to the terminals once they exist. */
interface HookRouting {
  readonly terminals: () => TerminalManager | null
  readonly reportTranscript: (hint: TranscriptHint) => void
  readonly onRpc: AgentRpcHandler
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

function updateDockBadge(manager: TerminalManager): void {
  const waiting = manager.countAgentsWithStatus('needs-input')
  app.dock?.setBadge(waiting > 0 ? String(waiting) : '')
}

/** Status is a nice-to-have: if hooks cannot start, terminals still work without it. */
async function startAgentHooks(env: AppEnv, routing: HookRouting): Promise<AgentHooks | null> {
  try {
    return await setupAgentHooks({
      dataDir: env.dataDir,
      commands: env.commands,
      onSignal: (terminalId, signal, details) => {
        routing.terminals()?.applyHookSignal(terminalId, signal, details)
        const { transcriptPath, sessionId } = details
        if (transcriptPath)
          routing.reportTranscript({ terminalId, transcriptPath, sessionId, isSubagent: false })
      },
      onSubagent: (terminalId, update, transcriptPath) => {
        routing.terminals()?.applySubagent(terminalId, update)
        if (transcriptPath)
          routing.reportTranscript({ terminalId, transcriptPath, isSubagent: true })
      },
      onRpc: routing.onRpc,
      // Electron runs the bundled MCP server in Node mode, so users need no separate Node.
      mcpServer: { command: process.execPath, script: join(import.meta.dirname, 'mcp.js') },
    })
  } catch (error) {
    console.error('[hooks] could not start; agent status disabled:', error)
    return null
  }
}

function createTerminalManager(hooks: AgentHooks | null, projects: ProjectStore): TerminalManager {
  const notifier = new AgentNotifier({
    isAppFocused: () => BrowserWindow.getFocusedWindow() !== null,
    projectName: (id) => findProject(projects, id)?.name,
    show: showNotification,
  })
  const manager: TerminalManager = new TerminalManager({
    backend: new NodePtyBackend(),
    createId: randomUUID,
    env: process.env,
    ...(hooks && { agentHooks: hooks.config }),
    onAgentStatusChange: (change) => {
      updateDockBadge(manager)
      notifier.handle(change)
    },
    approvedProjectServers: (projectId) => findProject(projects, projectId)?.approvedMcpServers,
  })
  return manager
}

function createCheckRunner(projects: ProjectStore): CheckRunner {
  return new CheckRunner({
    spawn: shellCheckSpawner(process.env),
    checkCommand: (id) => findProject(projects, id)?.checkCommand,
    now: () => Date.now(),
    timeoutMs: CHECK_TIMEOUT_MS,
    schedule,
  })
}

/**
 * The agent hook server (status, subagents, MCP tool calls; a token per terminal, decision 059),
 * the terminal manager it reports to, Verify on Stop checks and usage reporting.
 */
export async function composeTerminal(env: AppEnv, deps: TerminalDeps): Promise<TerminalServices> {
  // The hook server's config goes into the manager, so the manager is built after it; hooks only
  // fire for terminals the manager spawned, so they always find it.
  let manager: TerminalManager | null = null
  let reportTranscript: ((hint: TranscriptHint) => void) | null = null
  const terminals = (): TerminalManager | null => manager
  const hooks = await startAgentHooks(env, {
    terminals,
    reportTranscript: (hint) => reportTranscript?.(hint),
    onRpc: createAgentRpc({
      terminals,
      tasks: deps.tasks,
      context: deps.context,
      findProject: (projectId) => findProject(deps.projects, projectId),
      onContextChanged: (projectId) => broadcast(IpcChannel.contextChanged, projectId),
    }),
  })
  const built = createTerminalManager(hooks, deps.projects)
  manager = built
  if (deps.usage) {
    reportTranscript = createUsageReporter({
      usage: deps.usage,
      terminals: built,
      onProjectChange: (projectId) => broadcast(IpcChannel.usageChanged, projectId),
    })
  }
  return { hooks, manager: built, checks: createCheckRunner(deps.projects) }
}
