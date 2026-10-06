import type { AgentStatus, HookSignal } from '@shared/agentStatus'
import type { TerminalCreateRequest } from '@shared/ipc/contract'
import {
  isAgentKind,
  type TerminalExit,
  type TerminalId,
  type TerminalKind,
} from '@shared/terminal'
import type { HookDetails } from '../agentHooks/HookServer'
import type { AgentHooksConfig } from '../agentHooks/setupAgentHooks'
import type { AgentStatusChange } from '../notifications/AgentNotifier'
import type { TerminalBackend, TerminalProcess } from './TerminalBackend'
import { buildLaunchSpec, buildTerminalEnv, resolveShell, type Env } from './launchSpec'

export interface TerminalEvents {
  onData(id: TerminalId, data: string): void
  onExit(id: TerminalId, exit: TerminalExit): void
  onAgentStatus?(id: TerminalId, status: AgentStatus, detail?: string): void
  /** The Claude session id, reported when it starts or changes (e.g. after /clear). */
  onAgentSession?(id: TerminalId, sessionId: string): void
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
  /** Current Claude session, from SessionStart. */
  readonly sessionId: string | null
  /** True once the session has had a prompt; empty sessions cannot be resumed. */
  readonly hasConversation: boolean
  /** Last session id reported to the renderer (or the one it resumed). */
  readonly reportedSessionId: string | null
  /** The detail that came with the latest status. */
  readonly detail: string | null
}

const DEFAULT_CLAUDE_COMMAND = 'claude'
const DEFAULT_CODEX_COMMAND = 'codex'
const CONVERSATION_STATUSES: ReadonlySet<AgentStatus> = new Set(['working', 'needs-input', 'done'])

const SIGNAL_STATUS: Readonly<Record<HookSignal, AgentStatus>> = {
  ready: 'idle',
  working: 'working',
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
    const hooks = isAgentKind(request.kind) ? this.deps.agentHooks : undefined
    const isCodex = request.kind === 'codex'
    const isResuming = hooks !== undefined && request.resumeSessionId !== undefined
    const initialPrompt = hooks && !isResuming ? request.initialPrompt : undefined
    const mcpConfigPath = isCodex ? undefined : hooks?.writeMcpConfig?.(id)
    const codexOverrides = isCodex ? (hooks?.codexOverrides?.(id, request.cwd) ?? []) : []
    const launch = buildLaunchSpec(request.kind, resolveShell(this.deps.env), {
      hasAgentHooks: hooks !== undefined,
      isResuming,
      hasInitialPrompt: initialPrompt !== undefined,
      hasMcpConfig: mcpConfigPath !== undefined,
      codexOverrideCount: codexOverrides.length,
    })
    const process = this.deps.backend.spawn({
      ...launch,
      cwd: request.cwd,
      env: {
        ...buildTerminalEnv(this.deps.env),
        ...(hooks && hookEnv(id, hooks, isCodex)),
        ...Object.fromEntries(
          codexOverrides.map((value, index) => [`DUGOUT_CODEX_C${index}`, value]),
        ),
        ...(isResuming &&
          request.resumeSessionId && { DUGOUT_RESUME_SESSION: request.resumeSessionId }),
        ...(initialPrompt && { DUGOUT_INITIAL_PROMPT: initialPrompt }),
        ...(mcpConfigPath && { DUGOUT_MCP_CONFIG: mcpConfigPath }),
      },
      cols: request.cols,
      rows: request.rows,
    })

    process.onData((data) => events.onData(id, data))
    process.onExit((exit) => {
      const wasAgent = this.terminals.get(id)?.agentStatus != null
      this.terminals.delete(id)
      if (mcpConfigPath) hooks?.removeMcpConfig?.(id)
      events.onExit(id, exit)
      if (wasAgent) {
        this.deps.onAgentStatusChange?.({
          terminalId: id,
          projectId: request.projectId,
          status: null,
        })
      }
    })
    this.terminals.set(id, {
      process,
      kind: request.kind,
      projectId: request.projectId,
      events,
      agentStatus: hooks ? 'starting' : null,
      sessionId: null,
      hasConversation: request.resumeSessionId !== undefined,
      reportedSessionId: request.resumeSessionId ?? null,
      detail: null,
    })
    return id
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

  /** Applies a hook signal to a Claude terminal. Returns false if it is not one. */
  applyHookSignal(id: TerminalId, signal: HookSignal, details: HookDetails = {}): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.agentStatus === null) return false

    const next = {
      ...nextAgentState(terminal, SIGNAL_STATUS[signal], details.sessionId),
      detail: details.detail ?? null,
    }
    this.terminals.set(id, next)

    if (next.reportedSessionId !== terminal.reportedSessionId && next.reportedSessionId) {
      terminal.events.onAgentSession?.(id, next.reportedSessionId)
    }
    const isNewDetail = details.detail !== undefined && details.detail !== terminal.detail
    if ((next.agentStatus !== terminal.agentStatus || isNewDetail) && next.agentStatus) {
      terminal.events.onAgentStatus?.(id, next.agentStatus, details.detail)
      this.deps.onAgentStatusChange?.({
        terminalId: id,
        projectId: terminal.projectId,
        status: next.agentStatus,
        ...(details.detail && { detail: details.detail }),
      })
    }
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

function hookEnv(
  id: TerminalId,
  hooks: AgentHooksConfig,
  isCodex: boolean,
): Record<string, string> {
  const shared = {
    DUGOUT_TERMINAL_ID: id,
    DUGOUT_HOOK_SOCKET: hooks.socketPath,
    DUGOUT_HOOK_TOKEN: hooks.token,
  }
  return isCodex
    ? { ...shared, DUGOUT_CODEX_COMMAND: hooks.codexCommand ?? DEFAULT_CODEX_COMMAND }
    : {
        ...shared,
        DUGOUT_CLAUDE_SETTINGS: hooks.settingsPath,
        DUGOUT_CLAUDE_COMMAND: hooks.claudeCommand ?? DEFAULT_CLAUDE_COMMAND,
      }
}
