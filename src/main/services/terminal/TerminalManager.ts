import type { TerminalCreateRequest } from '@shared/ipc/contract'
import type { TerminalExit, TerminalId } from '@shared/terminal'
import type { TerminalBackend, TerminalProcess } from './TerminalBackend'
import { buildLaunchSpec, buildTerminalEnv, resolveShell, type Env } from './launchSpec'

export interface TerminalEvents {
  onData(id: TerminalId, data: string): void
  onExit(id: TerminalId, exit: TerminalExit): void
}

export interface TerminalManagerDeps {
  readonly backend: TerminalBackend
  readonly createId: () => TerminalId
  readonly env: Env
}

/** Owns the lifecycle of every running terminal process. */
export class TerminalManager {
  private readonly terminals = new Map<TerminalId, TerminalProcess>()

  constructor(private readonly deps: TerminalManagerDeps) {}

  get size(): number {
    return this.terminals.size
  }

  create(request: TerminalCreateRequest, events: TerminalEvents): TerminalId {
    const id = this.deps.createId()
    const launch = buildLaunchSpec(request.kind, resolveShell(this.deps.env))
    const process = this.deps.backend.spawn({
      ...launch,
      cwd: request.cwd,
      env: buildTerminalEnv(this.deps.env),
      cols: request.cols,
      rows: request.rows,
    })

    process.onData((data) => events.onData(id, data))
    process.onExit((exit) => {
      this.terminals.delete(id)
      events.onExit(id, exit)
    })
    this.terminals.set(id, process)
    return id
  }

  write(id: TerminalId, data: string): boolean {
    return this.withTerminal(id, (terminal) => terminal.write(data))
  }

  resize(id: TerminalId, cols: number, rows: number): boolean {
    return this.withTerminal(id, (terminal) => terminal.resize(cols, rows))
  }

  kill(id: TerminalId): boolean {
    return this.withTerminal(id, (terminal) => terminal.kill())
  }

  killAll(): void {
    for (const terminal of this.terminals.values()) terminal.kill()
    this.terminals.clear()
  }

  private withTerminal(id: TerminalId, action: (terminal: TerminalProcess) => void): boolean {
    const terminal = this.terminals.get(id)
    if (!terminal) return false
    action(terminal)
    return true
  }
}
