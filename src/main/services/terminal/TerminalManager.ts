import type { AgentStatus, HookSignal } from '@shared/agentStatus'
import type { TerminalCreateRequest } from '@shared/ipc/contract'
import type { TerminalExit, TerminalId, TerminalKind } from '@shared/terminal'
import type { AgentHooksConfig } from '../agentHooks/setupAgentHooks'
import type { AgentStatusChange } from '../notifications/AgentNotifier'
import type { TerminalBackend, TerminalProcess } from './TerminalBackend'
import { buildLaunchSpec, buildTerminalEnv, resolveShell, type Env } from './launchSpec'

export interface TerminalEvents {
  onData(id: TerminalId, data: string): void
  onExit(id: TerminalId, exit: TerminalExit): void
  onAgentStatus?(id: TerminalId, status: AgentStatus): void
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
}

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
    const hooks = request.kind === 'claude' ? this.deps.agentHooks : undefined
    const launch = buildLaunchSpec(request.kind, resolveShell(this.deps.env), {
      hasAgentHooks: hooks !== undefined,
    })
    const process = this.deps.backend.spawn({
      ...launch,
      cwd: request.cwd,
      env: { ...buildTerminalEnv(this.deps.env), ...(hooks && hookEnv(id, hooks)) },
      cols: request.cols,
      rows: request.rows,
    })

    process.onData((data) => events.onData(id, data))
    process.onExit((exit) => {
      const wasAgent = this.terminals.get(id)?.agentStatus != null
      this.terminals.delete(id)
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

  agentStatus(id: TerminalId): AgentStatus | null {
    return this.terminals.get(id)?.agentStatus ?? null
  }

  countAgentsWithStatus(status: AgentStatus): number {
    return [...this.terminals.values()].filter((t) => t.agentStatus === status).length
  }

  /** Applies a hook signal to a Claude terminal. Returns false if it is not one. */
  applyHookSignal(id: TerminalId, signal: HookSignal): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.agentStatus === null) return false

    const status = SIGNAL_STATUS[signal]
    if (status === terminal.agentStatus) return true

    this.terminals.set(id, { ...terminal, agentStatus: status })
    terminal.events.onAgentStatus?.(id, status)
    this.deps.onAgentStatusChange?.({ terminalId: id, projectId: terminal.projectId, status })
    return true
  }

  private withProcess(id: TerminalId, action: (process: TerminalProcess) => void): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false
    action(terminal.process)
    return true
  }
}

function hookEnv(id: TerminalId, hooks: AgentHooksConfig): Record<string, string> {
  return {
    DUGOUT_TERMINAL_ID: id,
    DUGOUT_HOOK_SOCKET: hooks.socketPath,
    DUGOUT_HOOK_TOKEN: hooks.token,
    DUGOUT_CLAUDE_SETTINGS: hooks.settingsPath,
    ...(hooks.claudeCommand && { DUGOUT_CLAUDE_COMMAND: hooks.claudeCommand }),
  }
}
