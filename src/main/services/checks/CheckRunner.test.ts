import { describe, expect, test, vi } from 'vitest'
import type { CheckStatus } from '@shared/checks'
import { CheckRunner, type CheckHandlers, type CheckProcess } from './CheckRunner'

interface FakeRun {
  readonly command: string
  readonly cwd: string
  readonly handlers: CheckHandlers
  isKilled: boolean
}

function setup(options: { command?: string | undefined; timeoutMs?: number } = {}) {
  const runs: FakeRun[] = []
  const timers: { run: () => void; ms: number; isCancelled: boolean }[] = []
  let clock = 1_000
  const command = 'command' in options ? options.command : 'npm run check'
  const runner = new CheckRunner({
    checkCommand: () => command,
    spawn: (spawnCommand, cwd, handlers): CheckProcess => {
      const run: FakeRun = { command: spawnCommand, cwd, handlers, isKilled: false }
      runs.push(run)
      return { kill: () => (run.isKilled = true) }
    },
    now: () => clock,
    timeoutMs: options.timeoutMs ?? 60_000,
    schedule: (run, ms) => {
      const timer = { run, ms, isCancelled: false }
      timers.push(timer)
      return () => (timer.isCancelled = true)
    },
  })
  const seen: CheckStatus[] = []
  const notify = vi.fn((status: CheckStatus) => seen.push(status))
  runner.track('t1', { projectId: 'p1', cwd: '/repo' }, notify)
  const advance = (ms: number) => (clock += ms)
  return { runner, runs, timers, seen, notify, advance }
}

describe('CheckRunner', () => {
  test('runs the project check in the agent checkout when the agent stops', () => {
    // Arrange
    const { runner, runs, seen } = setup()

    // Act
    runner.agentStatus('t1', 'working')
    runner.agentStatus('t1', 'done')

    // Assert
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ command: 'npm run check', cwd: '/repo' })
    expect(seen).toEqual([{ state: 'running', command: 'npm run check' }])
  })

  test('reports passed with its duration when the command exits 0', () => {
    const { runner, runs, seen, advance } = setup()
    runner.agentStatus('t1', 'done')

    advance(2_500)
    runs[0]?.handlers.onExit(0)

    expect(seen.at(-1)).toEqual({ state: 'passed', command: 'npm run check', durationMs: 2_500 })
    expect(runner.statusOf('t1')).toEqual(seen.at(-1))
  })

  test('reports failed with the tail of the output, without colour codes', () => {
    const { runner, runs, seen } = setup()
    runner.agentStatus('t1', 'done')

    runs[0]?.handlers.onOutput('\u001b[31mFAIL\u001b[0m src/a.test.ts\r\n')
    runs[0]?.handlers.onOutput('expected 1 to be 2\n')
    runs[0]?.handlers.onExit(1)

    expect(seen.at(-1)).toEqual({
      state: 'failed',
      command: 'npm run check',
      exitCode: 1,
      output: 'FAIL src/a.test.ts\nexpected 1 to be 2',
    })
  })

  test('keeps only the end of long output', () => {
    const { runner, runs, seen } = setup()
    runner.agentStatus('t1', 'done')

    runs[0]?.handlers.onOutput('x'.repeat(50_000))
    runs[0]?.handlers.onOutput('\nlast line')
    runs[0]?.handlers.onExit(2)

    const status = seen.at(-1)
    expect(status?.state).toBe('failed')
    const output = status?.state === 'failed' ? status.output : ''
    expect(output.length).toBeLessThanOrEqual(6_000)
    expect(output.endsWith('\nlast line')).toBe(true)
  })

  test('a new stop while a check runs cancels it and starts again', () => {
    // Arrange
    const { runner, runs, seen } = setup()
    runner.agentStatus('t1', 'done')

    // Act: the agent works and stops again before the first check finished
    runner.agentStatus('t1', 'working')
    runner.agentStatus('t1', 'done')
    runs[0]?.handlers.onExit(1)

    // Assert: the first run was killed and its late exit is ignored
    expect(runs[0]?.isKilled).toBe(true)
    expect(runs).toHaveLength(2)
    expect(seen.at(-1)).toEqual({ state: 'running', command: 'npm run check' })
  })

  test('a repeated done signal restarts a running check', () => {
    const { runner, runs } = setup()
    runner.agentStatus('t1', 'done')

    runner.agentStatus('t1', 'done')

    expect(runs[0]?.isKilled).toBe(true)
    expect(runs).toHaveLength(2)
  })

  test('a new turn clears the last result, since the code is changing again', () => {
    const { runner, runs, seen } = setup()
    runner.agentStatus('t1', 'done')
    runs[0]?.handlers.onExit(0)

    runner.agentStatus('t1', 'working')

    expect(seen.at(-1)).toEqual({ state: 'idle' })
  })

  test('statuses other than done and working leave the check alone', () => {
    const { runner, runs, notify } = setup()
    runner.agentStatus('t1', 'done')
    notify.mockClear()

    runner.agentStatus('t1', 'needs-input')
    runner.agentStatus('t1', 'idle')

    expect(runs[0]?.isKilled).toBe(false)
    expect(notify).not.toHaveBeenCalled()
  })

  test('does nothing when the project has no check command', () => {
    const { runner, runs, notify } = setup({ command: undefined })

    runner.agentStatus('t1', 'done')

    expect(runs).toHaveLength(0)
    expect(notify).not.toHaveBeenCalled()
    expect(runner.statusOf('t1')).toEqual({ state: 'idle' })
  })

  test('a check that runs too long is stopped and reported as failed', () => {
    const { runner, runs, timers, seen } = setup({ timeoutMs: 5_000 })
    runner.agentStatus('t1', 'done')
    runs[0]?.handlers.onOutput('still going\n')

    timers[0]?.run()

    expect(timers[0]?.ms).toBe(5_000)
    expect(runs[0]?.isKilled).toBe(true)
    expect(seen.at(-1)).toEqual({
      state: 'failed',
      command: 'npm run check',
      exitCode: null,
      output: 'still going\nStopped: the check took longer than 5 seconds.',
    })
  })

  test('finishing cancels the timeout', () => {
    const { runner, runs, timers } = setup()
    runner.agentStatus('t1', 'done')

    runs[0]?.handlers.onExit(0)

    expect(timers[0]?.isCancelled).toBe(true)
  })

  test('untracking a terminal kills its check and ignores late results', () => {
    const { runner, runs, notify } = setup()
    runner.agentStatus('t1', 'done')
    notify.mockClear()

    runner.untrack('t1')
    runs[0]?.handlers.onExit(0)
    runner.agentStatus('t1', 'done')

    expect(runs[0]?.isKilled).toBe(true)
    expect(runs).toHaveLength(1)
    expect(notify).not.toHaveBeenCalled()
  })

  test('stopAll kills every running check', () => {
    const { runner, runs } = setup()
    runner.track('t2', { projectId: 'p1', cwd: '/wt' }, vi.fn())
    runner.agentStatus('t1', 'done')
    runner.agentStatus('t2', 'done')

    runner.stopAll()

    expect(runs.map((run) => run.isKilled)).toEqual([true, true])
    expect(runs[1]?.cwd).toBe('/wt')
  })

  test('a command that cannot start fails with the reason', () => {
    const { runner, runs, seen } = setup()
    runner.agentStatus('t1', 'done')

    runs[0]?.handlers.onError('spawn /bin/zsh ENOENT')

    expect(seen.at(-1)).toEqual({
      state: 'failed',
      command: 'npm run check',
      exitCode: null,
      output: 'Could not run the check: spawn /bin/zsh ENOENT',
    })
  })
})
