import type { AgentStatus, HookSignal, SubagentUpdate } from '@shared/agentStatus'
import type { AgentUsage } from '@shared/usage'
import type { TerminalCreateRequest } from '@shared/ipc/contract'
import {
  isAgentKind,
  type AgentKind,
  type TerminalExit,
  type TerminalId,
  type TerminalKind,
} from '@shared/terminal'
import type { ToolCallPreview } from '@shared/toolCall'
import type { HookDetails } from '../agentHooks/HookServer'
import { NO_APPROVALS, trackApprovals, type PendingApproval } from '../agentHooks/pendingApprovals'
import type { AgentHooksConfig } from '../agentHooks/setupAgentHooks'
import type { AgentStatusChange } from '../notifications/AgentNotifier'
import type { TerminalBackend, TerminalProcess } from './TerminalBackend'
import type { AgentAdapter, AgentLaunch } from '../agents/AgentAdapter'
import { dugoutMcpServer, HOOK_TOKEN_VARIABLE } from '../agents/dugoutMcp'
import { agentAdapter } from '../agents/registry'
import { buildLaunchSpec, buildTerminalEnv, resolveShell, type Env } from './launchSpec'

export interface TerminalEvents {
  onData(id: TerminalId, data: string): void
  onExit(id: TerminalId, exit: TerminalExit): void
  /** `approvals`: the tool calls waiting for the user, oldest first (empty unless needs-input). */
  onAgentStatus?(
    id: TerminalId,
    status: AgentStatus,
    detail: string | undefined,
    approvals: readonly ToolCallPreview[],
  ): void
  /** The agent's session id, reported when it starts or changes (e.g. after /clear). */
  onAgentSession?(id: TerminalId, sessionId: string): void
  /** A subagent of this terminal's agent started or stopped. */
  onAgentSubagent?(id: TerminalId, update: SubagentUpdate): void
  /** The agent session's token usage so far, after its transcript grew. */
  onAgentUsage?(id: TerminalId, usage: AgentUsage): void
}

/** What an agent terminal's usage is attributed to. */
export interface AgentTerminalInfo {
  readonly kind: AgentKind
  readonly projectId: string
  readonly cwd: string
  readonly taskNumber: number | null
  readonly sessionId: string | null
}

export interface TerminalManagerDeps {
  readonly backend: TerminalBackend
  readonly createId: () => TerminalId
  readonly env: Env
  readonly agentHooks?: AgentHooksConfig
  /** Called after any agent's status changes (null status once it exits). */
  readonly onAgentStatusChange?: (change: AgentStatusChange) => void
}

/** A new worktree's setup command, as `WorktreeManager.claimSetup` hands it out. */
export interface TerminalSetup {
  readonly command: string
  /** Called once the setup ends; false when it failed or the terminal closed first. */
  finish(isSuccess: boolean): void
}

type Spawn = (commandLine: string | undefined, env?: Record<string, string>) => TerminalProcess

interface SetupNext {
  startAgent(): TerminalProcess
  finish(exit: TerminalExit): void
  onData(id: TerminalId, data: string): void
}

/** Runs the setup in the user's shell, as if typed there; plain "$VAR"s only (decision 013). */
const SETUP_COMMAND_LINE = 'echo "$DUGOUT_SETUP_BANNER" && eval "$DUGOUT_SETUP_COMMAND"'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'
const RESET = '\x1b[0m'

function setupFailedMessage(exit: TerminalExit): string {
  const reason = exit.signal ? `was stopped (signal ${exit.signal})` : `exit code ${exit.exitCode}`
  return `\r\n${RED}Worktree setup failed (${reason}).${RESET} Restart to run it again.\r\n`
}

interface ManagedTerminal {
  /** The agent or shell; during a worktree setup, the setup command. */
  readonly process: TerminalProcess
  /** Latest size, for an agent that starts after a worktree setup. */
  readonly size: { readonly cols: number; readonly rows: number }
  readonly kind: TerminalKind
  readonly projectId: string
  readonly cwd: string
  readonly taskNumber: number | null
  readonly events: TerminalEvents
  readonly agentStatus: AgentStatus | null
  /** Current agent session, from its hooks. */
  readonly sessionId: string | null
  /** True once the session has had a prompt; empty sessions cannot be resumed. */
  readonly hasConversation: boolean
  /** Last session id reported to the renderer (or the one it resumed). */
  readonly reportedSessionId: string | null
  /** The detail that came with the latest status. */
  readonly detail: string | null
  /** Tool calls the agent asked to have approved that have not finished yet. */
  readonly approvals: readonly PendingApproval[]
}

const CONVERSATION_STATUSES: ReadonlySet<AgentStatus> = new Set(['working', 'needs-input', 'done'])

const SIGNAL_STATUS: Readonly<Record<HookSignal, AgentStatus>> = {
  ready: 'idle',
  working: 'working',
  'tool-done': 'working',
  'needs-input': 'needs-input',
  done: 'done',
}

/** Owns the lifecycle of every running terminal process and its agent status. */
export class TerminalManager {
  private readonly terminals = new Map<TerminalId, ManagedTerminal>()

  constructor(private readonly deps: TerminalManagerDeps) {}

  get size(): number {
    return this.terminals.size
  }

  /** `setup`: a new worktree's setup command, run in this terminal before the agent starts. */
  create(
    request: TerminalCreateRequest,
    events: TerminalEvents,
    setup?: TerminalSetup,
  ): TerminalId {
    const id = this.deps.createId()
    const adapter = isAgentKind(request.kind) ? agentAdapter(request.kind) : null
    const hooks = adapter ? this.deps.agentHooks : undefined
    const launch = adapter && hooks ? this.launchAgent(id, adapter, hooks, request) : null
    const commandLine = adapter ? (launch?.commandLine ?? adapter.defaultCommand) : undefined
    const env = {
      ...buildTerminalEnv(this.deps.env),
      ...launch?.env,
      ...(request.port !== undefined && { PORT: String(request.port) }),
    }
    const spawn: Spawn = (line, extraEnv = {}) => {
      const size = this.terminals.get(id)?.size ?? { cols: request.cols, rows: request.rows }
      const process = this.deps.backend.spawn({
        ...buildLaunchSpec(resolveShell(this.deps.env), line),
        cwd: request.cwd,
        env: { ...env, ...extraEnv },
        ...size,
      })
      process.onData((data) => events.onData(id, data))
      return process
    }
    const finish = (exit: TerminalExit) => {
      launch?.dispose?.()
      this.handleExit(id, request.projectId, events, exit)
    }
    const startAgent = () => {
      const process = spawn(commandLine)
      process.onExit(finish)
      return process
    }
    const process = setup
      ? this.runSetup(id, setup, spawn, { startAgent, finish, onData: events.onData })
      : startAgent()
    const hasStatus = launch !== null && adapter?.info.capabilities.hasStatus === true
    this.terminals.set(id, {
      process,
      size: { cols: request.cols, rows: request.rows },
      kind: request.kind,
      projectId: request.projectId,
      cwd: request.cwd,
      taskNumber: request.taskNumber ?? null,
      events,
      agentStatus: hasStatus ? 'starting' : null,
      sessionId: null,
      hasConversation: request.resumeSessionId !== undefined,
      reportedSessionId: request.resumeSessionId ?? null,
      detail: null,
      approvals: NO_APPROVALS,
    })
    return id
  }

  private handleExit(
    id: TerminalId,
    projectId: string,
    events: TerminalEvents,
    exit: TerminalExit,
  ): void {
    const wasAgent = this.terminals.get(id)?.agentStatus != null
    this.terminals.delete(id)
    events.onExit(id, exit)
    if (wasAgent) this.deps.onAgentStatusChange?.({ terminalId: id, projectId, status: null })
  }

  /**
   * Runs the setup command in the terminal (shown as it runs), then swaps in the agent if it
   * succeeded. On failure, or if the terminal is closed first, the terminal exits as it is.
   */
  private runSetup(id: TerminalId, setup: TerminalSetup, spawn: Spawn, next: SetupNext) {
    const process = spawn(SETUP_COMMAND_LINE, {
      DUGOUT_SETUP_COMMAND: setup.command,
      DUGOUT_SETUP_BANNER: `${DIM}Worktree setup: ${setup.command}${RESET}`,
    })
    process.onExit((exit) => {
      const terminal = this.terminals.get(id)
      const isOpen = terminal !== undefined && terminal.process === process
      const isSuccess = isOpen && exit.exitCode === 0 && !exit.signal
      setup.finish(isSuccess)
      if (isSuccess) {
        this.terminals.set(id, { ...terminal, process: next.startAgent() })
        return
      }
      if (isOpen) next.onData(id, setupFailedMessage(exit))
      next.finish(exit)
    })
    return process
  }

  /**
   * The adapter's launch plus the variables every agent gets: hooks (with this terminal's own
   * token, forgotten when it exits: decision 059), resume id, first prompt.
   */
  private launchAgent(
    id: TerminalId,
    adapter: AgentAdapter,
    hooks: AgentHooksConfig,
    request: TerminalCreateRequest,
  ): AgentLaunch {
    const resumeSessionId = adapter.info.capabilities.canResume
      ? request.resumeSessionId
      : undefined
    const initialPrompt = resumeSessionId === undefined ? request.initialPrompt : undefined
    const mcp = adapter.info.capabilities.hasMcp ? hooks.mcp : undefined
    const token = hooks.tokens.issue(id)
    const launch = adapter.launch({
      terminalId: id,
      cwd: request.cwd,
      dataDir: hooks.dataDir,
      command: hooks.commands?.[adapter.info.kind] ?? adapter.defaultCommand,
      isResuming: resumeSessionId !== undefined,
      hasInitialPrompt: initialPrompt !== undefined,
      ...(mcp && {
        mcp: {
          server: dugoutMcpServer(mcp.server, hooks.socketPath, id),
          files: mcp.files,
        },
      }),
    })
    return {
      ...launch,
      env: {
        DUGOUT_TERMINAL_ID: id,
        DUGOUT_HOOK_SOCKET: hooks.socketPath,
        [HOOK_TOKEN_VARIABLE]: token,
        ...launch.env,
        ...(resumeSessionId && { DUGOUT_RESUME_SESSION: resumeSessionId }),
        ...(initialPrompt && { DUGOUT_INITIAL_PROMPT: initialPrompt }),
      },
      dispose: () => {
        launch.dispose?.()
        hooks.tokens.revoke(id)
      },
    }
  }

  write(id: TerminalId, data: string): boolean {
    return this.withProcess(id, (process) => process.write(data))
  }

  resize(id: TerminalId, cols: number, rows: number): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false
    // Kept for the agent that follows a worktree setup in the same terminal.
    this.terminals.set(id, { ...terminal, size: { cols, rows } })
    terminal.process.resize(cols, rows)
    return true
  }

  kill(id: TerminalId): boolean {
    return this.withProcess(id, (process) => process.kill())
  }

  killAll(): void {
    for (const terminal of this.terminals.values()) terminal.process.kill()
    this.terminals.clear()
  }

  /** The project a terminal belongs to, e.g. to scope an agent's task tools. */
  projectOf(id: TerminalId): string | null {
    return this.terminals.get(id)?.projectId ?? null
  }

  /** An agent terminal's project, checkout, task and current session; null for shells. */
  agentInfo(id: TerminalId): AgentTerminalInfo | null {
    const terminal = this.terminals.get(id)
    if (!terminal || !isAgentKind(terminal.kind)) return null
    const { kind, projectId, cwd, taskNumber, sessionId } = terminal
    return { kind, projectId, cwd, taskNumber, sessionId }
  }

  /** Passes an agent's usage on to the renderer that owns its terminal. */
  reportUsage(id: TerminalId, usage: AgentUsage): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false
    terminal.events.onAgentUsage?.(id, usage)
    return true
  }

  agentStatus(id: TerminalId): AgentStatus | null {
    return this.terminals.get(id)?.agentStatus ?? null
  }

  countAgentsWithStatus(status: AgentStatus): number {
    return [...this.terminals.values()].filter((t) => t.agentStatus === status).length
  }

  /** Applies a hook signal to an agent terminal with status. Returns false if it is not one. */
  applyHookSignal(id: TerminalId, signal: HookSignal, details: HookDetails = {}): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.agentStatus === null) return false

    const approvals = trackApprovals(terminal.approvals, signal, details)
    // While a tool call waits for approval, the agent needs you, whatever else finishes.
    const waiting = approvals[0]
    const status = waiting ? 'needs-input' : SIGNAL_STATUS[signal]
    const detail = waiting ? (waiting.detail ?? undefined) : details.detail
    const next = {
      ...nextAgentState(terminal, status, details.sessionId),
      detail: detail ?? null,
      approvals,
    }
    this.terminals.set(id, next)

    if (next.reportedSessionId !== terminal.reportedSessionId && next.reportedSessionId) {
      terminal.events.onAgentSession?.(id, next.reportedSessionId)
    }
    const isNewStatus = next.agentStatus !== terminal.agentStatus
    const isNewDetail = detail !== undefined && detail !== terminal.detail
    if (isNewStatus || isNewDetail || approvals !== terminal.approvals) {
      const previews = approvals.map((approval) => approval.preview)
      terminal.events.onAgentStatus?.(id, status, detail, previews)
    }
    if (isNewStatus || isNewDetail) {
      this.deps.onAgentStatusChange?.({
        terminalId: id,
        projectId: terminal.projectId,
        status,
        ...(detail && { detail }),
      })
    }
    return true
  }

  /** Passes a subagent update on to the renderer; the agent's own status is unchanged. */
  applySubagent(id: TerminalId, update: SubagentUpdate): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.agentStatus === null) return false
    terminal.events.onAgentSubagent?.(id, update)
    return true
  }

  private withProcess(id: TerminalId, action: (process: TerminalProcess) => void): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false
    action(terminal.process)
    return true
  }
}

/**
 * A later session in the same process (e.g. after /clear) starts without a conversation; the
 * first one keeps whatever the terminal started with (true when it resumed one).
 */
function nextAgentState(
  terminal: ManagedTerminal,
  status: AgentStatus,
  reportedId: string | undefined,
): ManagedTerminal {
  const isNewSession = reportedId !== undefined && reportedId !== terminal.sessionId
  const sessionId = reportedId ?? terminal.sessionId
  const startedFresh = isNewSession && terminal.sessionId !== null
  const hasConversation =
    CONVERSATION_STATUSES.has(status) || (startedFresh ? false : terminal.hasConversation)
  const shouldReport = hasConversation && sessionId !== null
  return {
    ...terminal,
    agentStatus: status,
    sessionId,
    hasConversation,
    reportedSessionId: shouldReport ? sessionId : terminal.reportedSessionId,
  }
}
