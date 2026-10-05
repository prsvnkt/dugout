import type { TerminalExit } from '@shared/terminal'

export interface Disposable {
  dispose(): void
}

export interface SpawnOptions {
  readonly file: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: Readonly<Record<string, string>>
  readonly cols: number
  readonly rows: number
}

export interface TerminalProcess {
  readonly pid: number
  onData(listener: (data: string) => void): Disposable
  onExit(listener: (exit: TerminalExit) => void): Disposable
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
}

/**
 * Abstraction over how terminals are hosted. Today: node-pty in-process.
 * A tmux-backed implementation can slot in later without touching callers.
 */
export interface TerminalBackend {
  spawn(options: SpawnOptions): TerminalProcess
}
