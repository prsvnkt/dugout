import type { AgentStatus } from '@shared/agentStatus'
import { CHECK_IDLE, type CheckStatus } from '@shared/checks'
import type { ProjectId } from '@shared/project'
import type { TerminalId } from '@shared/terminal'
import { appendOutput, outputTail } from './checkOutput'

export interface CheckHandlers {
  onOutput(chunk: string): void
  /** Null when the process was ended by a signal. */
  onExit(exitCode: number | null): void
  /** The process could not be started at all. */
  onError(message: string): void
}

export interface CheckProcess {
  kill(): void
}

export interface CheckRunnerDeps {
  /** Starts the command in `cwd`; handlers fire until the process is killed. */
  readonly spawn: (command: string, cwd: string, handlers: CheckHandlers) => CheckProcess
  /** The project's check command, or undefined when it has none (the default). */
  readonly checkCommand: (projectId: ProjectId) => string | undefined
  readonly now: () => number
  readonly timeoutMs: number
  /** Runs `run` after `ms`; returns a function that cancels it. */
  readonly schedule: (run: () => void, ms: number) => () => void
}

/** Where an agent runs, and how to tell its owner about its check. */
export interface CheckTarget {
  readonly projectId: ProjectId
  readonly cwd: string
}

interface Run {
  readonly process: CheckProcess
  readonly command: string
  readonly startedAt: number
  readonly cancelTimeout: () => void
  output: string
}

interface Tracked {
  readonly target: CheckTarget
  readonly notify: (status: CheckStatus) => void
  readonly status: CheckStatus
  readonly run: Run | null
}

const MS_PER_SECOND = 1_000
const SECONDS_PER_MINUTE = 60

function describeDuration(ms: number): string {
  const seconds = Math.round(ms / MS_PER_SECOND)
  return seconds < SECONDS_PER_MINUTE * 2
    ? `${seconds} seconds`
    : `${Math.round(seconds / SECONDS_PER_MINUTE)} minutes`
}

/**
 * Verify on Stop: runs a project's check command each time one of its agents finishes a turn,
 * in that agent's checkout, in a process Dugout owns (never the agent's terminal). One check per
 * agent: a new stop cancels a running check and starts it again; a new turn clears the result.
 */
export class CheckRunner {
  private readonly tracked = new Map<TerminalId, Tracked>()

  constructor(private readonly deps: CheckRunnerDeps) {}

  track(id: TerminalId, target: CheckTarget, notify: (status: CheckStatus) => void): void {
    this.tracked.set(id, { target, notify, status: CHECK_IDLE, run: null })
  }

  /** Forgets a terminal (it exited), killing its check. */
  untrack(id: TerminalId): void {
    this.tracked.get(id)?.run?.process.kill()
    this.tracked.delete(id)
  }

  stopAll(): void {
    for (const id of [...this.tracked.keys()]) this.untrack(id)
  }

  statusOf(id: TerminalId): CheckStatus {
    return this.tracked.get(id)?.status ?? CHECK_IDLE
  }

  /** Called with each status the agent reports. */
  agentStatus(id: TerminalId, status: AgentStatus): void {
    const entry = this.tracked.get(id)
    if (!entry) return
    if (status === 'done') this.start(id, entry)
    else if (status === 'working') this.reset(id, entry)
  }

  private start(id: TerminalId, entry: Tracked): void {
    entry.run?.process.kill()
    entry.run?.cancelTimeout()
    const command = this.deps.checkCommand(entry.target.projectId)
    if (!command) return this.update(id, { ...entry, run: null }, CHECK_IDLE)

    const isCurrent = () => this.tracked.get(id)?.run === run
    const run: Run = {
      command,
      startedAt: this.deps.now(),
      output: '',
      cancelTimeout: this.deps.schedule(() => {
        if (isCurrent()) this.timeOut(id, run)
      }, this.deps.timeoutMs),
      process: this.deps.spawn(command, entry.target.cwd, {
        onOutput: (chunk) => {
          if (isCurrent()) run.output = appendOutput(run.output, chunk)
        },
        onExit: (exitCode) => {
          if (isCurrent()) this.finish(id, run, exitCode)
        },
        onError: (message) => {
          if (isCurrent()) this.fail(id, run, null, `Could not run the check: ${message}`)
        },
      }),
    }
    this.update(id, { ...entry, run }, { state: 'running', command })
  }

  private finish(id: TerminalId, run: Run, exitCode: number | null): void {
    if (exitCode !== 0) return this.fail(id, run, exitCode, outputTail(run.output))
    const durationMs = this.deps.now() - run.startedAt
    this.settle(id, run, { state: 'passed', command: run.command, durationMs })
  }

  private timeOut(id: TerminalId, run: Run): void {
    run.process.kill()
    const reason = `Stopped: the check took longer than ${describeDuration(this.deps.timeoutMs)}.`
    this.fail(id, run, null, [outputTail(run.output), reason].filter(Boolean).join('\n'))
  }

  private fail(id: TerminalId, run: Run, exitCode: number | null, output: string): void {
    this.settle(id, run, { state: 'failed', command: run.command, exitCode, output })
  }

  private settle(id: TerminalId, run: Run, status: CheckStatus): void {
    const entry = this.tracked.get(id)
    if (!entry) return
    run.cancelTimeout()
    this.update(id, { ...entry, run: null }, status)
  }

  /** A new turn: the code is changing again, so a running check or old result no longer applies. */
  private reset(id: TerminalId, entry: Tracked): void {
    entry.run?.process.kill()
    entry.run?.cancelTimeout()
    this.update(id, { ...entry, run: null }, CHECK_IDLE)
  }

  private update(id: TerminalId, entry: Tracked, status: CheckStatus): void {
    this.tracked.set(id, { ...entry, status })
    if (status !== entry.status) entry.notify(status)
  }
}
