import type { AgentStatus, HookSignal, SubagentUpdate } from '@shared/agentStatus'
import type { TerminalCreateRequest } from '@shared/ipc/contract'
import {
  isAgentKind,
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
import { dugoutMcpServer } from '../agents/dugoutMcp'
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
}

export interface TerminalManagerDeps {
  readonly backend: TerminalBackend
  readonly createId: () => TerminalId
  readonly env: Env
  readonly agentHooks?: AgentHooksConfig
  /** Called after any agent's status changes (null status once it exits). */
  readonly onAgentStatusChange?: (change: AgentStatusChange) => void
}

interface ManagedTerminal {
  readonly process: TerminalProcess
  readonly kind: TerminalKind
  readonly projectId: string
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

  create(request: TerminalCreateRequest, events: TerminalEvents): TerminalId {
    const id = this.deps.createId()
    const adapter = isAgentKind(request.kind) ? agentAdapter(request.kind) : null
    const hooks = adapter ? this.deps.agentHooks : undefined
    const launch = adapter && hooks ? this.launchAgent(id, adapter, hooks, request) : null
    const commandLine = adapter ? (launch?.commandLine ?? adapter.defaultCommand) : undefined
    const process = this.deps.backend.spawn({
      ...buildLaunchSpec(resolveShell(this.deps.env), commandLine),
      cwd: request.cwd,
      env: {
        ...buildTerminalEnv(this.deps.env),
        ...launch?.env,
        ...(request.port !== undefined && { PORT: String(request.port) }),
      },
      cols: request.cols,
      rows: request.rows,
    })

    process.onData((data) => events.onData(id, data))
    process.onExit((exit) => {
      const wasAgent = this.terminals.get(id)?.agentStatus != null
      this.terminals.delete(id)
      launch?.dispose?.()
      events.onExit(id, exit)
      if (wasAgent) {
        this.deps.onAgentStatusChange?.({
          terminalId: id,
          projectId: request.projectId,
          status: null,
        })
      }
    })
    const hasStatus = launch !== null && adapter?.info.capabilities.hasStatus === true
    this.terminals.set(id, {
      process,
      kind: request.kind,
      projectId: request.projectId,
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

  /** The adapter's launch plus the variables every agent gets: hooks, resume id, first prompt. */
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
    const launch = adapter.launch({
      terminalId: id,
      cwd: request.cwd,
      dataDir: hooks.dataDir,
      command: hooks.commands?.[adapter.info.kind] ?? adapter.defaultCommand,
      isResuming: resumeSessionId !== undefined,
      hasInitialPrompt: initialPrompt !== undefined,
      ...(mcp && {
        mcp: {
          server: dugoutMcpServer(mcp.server, hooks.socketPath, hooks.token, id),
          files: mcp.files,
        },
      }),
    })
    return {
      ...launch,
      env: {
        DUGOUT_TERMINAL_ID: id,
        DUGOUT_HOOK_SOCKET: hooks.socketPath,
        DUGOUT_HOOK_TOKEN: hooks.token,
        ...launch.env,
        ...(resumeSessionId && { DUGOUT_RESUME_SESSION: resumeSessionId }),
        ...(initialPrompt && { DUGOUT_INITIAL_PROMPT: initialPrompt }),
      },
    }
  }

  write(id: TerminalId, data: string): boolean {
    return this.withProcess(id, (process) => process.write(data))
  }

  resize(id: TerminalId, cols: number, rows: number): boolean {
    return this.withProcess(id, (process) => process.resize(cols, rows))
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
