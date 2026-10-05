import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { TerminalExit } from '@shared/terminal'
import type { SpawnOptions, TerminalBackend, TerminalProcess } from './TerminalBackend'
import { TerminalManager } from './TerminalManager'

class FakeProcess implements TerminalProcess {
  readonly pid = 4242
  readonly written: string[] = []
  size: { cols: number; rows: number }
  isKilled = false
  private dataListener: ((data: string) => void) | undefined
  private exitListener: ((exit: TerminalExit) => void) | undefined

  constructor(readonly options: SpawnOptions) {
    this.size = { cols: options.cols, rows: options.rows }
  }

  onData(listener: (data: string) => void) {
    this.dataListener = listener
    return { dispose: () => (this.dataListener = undefined) }
  }

  onExit(listener: (exit: TerminalExit) => void) {
    this.exitListener = listener
    return { dispose: () => (this.exitListener = undefined) }
  }

  write(data: string) {
    this.written.push(data)
  }

  resize(cols: number, rows: number) {
    this.size = { cols, rows }
  }

  kill() {
    this.isKilled = true
  }

  emitData(data: string) {
    this.dataListener?.(data)
  }

  emitExit(exit: TerminalExit) {
    this.exitListener?.(exit)
  }
}

function setup() {
  const spawned: FakeProcess[] = []
  const backend: TerminalBackend = {
    spawn: (options) => {
      const process = new FakeProcess(options)
      spawned.push(process)
      return process
    },
  }
  let nextId = 0
  const manager = new TerminalManager({
    backend,
    createId: () => `t${++nextId}`,
    env: { SHELL: '/bin/zsh', PATH: '/usr/bin', ELECTRON_RUN_AS_NODE: '1' },
  })
  const events = { onData: vi.fn(), onExit: vi.fn(), onAgentStatus: vi.fn() }
  return { manager, spawned, events }
}

function setupWithHooks() {
  const spawned: FakeProcess[] = []
  const onAgentStatusChange = vi.fn()
  const manager = new TerminalManager({
    backend: {
      spawn: (options) => {
        const process = new FakeProcess(options)
        spawned.push(process)
        return process
      },
    },
    createId: () => 'agent-1',
    env: { SHELL: '/bin/zsh' },
    agentHooks: {
      settingsPath: '/data/claude-hooks.json',
      socketPath: '/data/hooks.sock',
      token: 'tok',
      claudeCommand: '/opt/fake/claude',
    },
    onAgentStatusChange,
  })
  const events = { onData: vi.fn(), onExit: vi.fn(), onAgentStatus: vi.fn() }
  return { manager, spawned, events, onAgentStatusChange }
}

const request = { kind: 'claude', projectId: 'proj-1', cwd: '/repo', cols: 100, rows: 30 } as const

describe('TerminalManager', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(() => {
    ctx = setup()
  })

  test('spawns claude in the requested folder with a sanitised env', () => {
    const id = ctx.manager.create(request, ctx.events)

    expect(id).toBe('t1')
    const options = ctx.spawned[0]?.options
    expect(options).toMatchObject({
      file: '/bin/zsh',
      args: ['-l', '-i', '-c', 'claude'],
      cwd: '/repo',
      cols: 100,
      rows: 30,
    })
    expect(options?.env).not.toHaveProperty('ELECTRON_RUN_AS_NODE')
    expect(options?.env.TERM).toBe('xterm-256color')
  })

  test('forwards output tagged with the terminal id', () => {
    const id = ctx.manager.create(request, ctx.events)
    ctx.spawned[0]?.emitData('hello')
    expect(ctx.events.onData).toHaveBeenCalledWith(id, 'hello')
  })

  test('routes input and resizes to the right process', () => {
    ctx.manager.create(request, ctx.events)
    const second = ctx.manager.create({ ...request, kind: 'shell' }, ctx.events)

    expect(ctx.manager.write(second, 'ls\r')).toBe(true)
    expect(ctx.manager.resize(second, 80, 24)).toBe(true)

    expect(ctx.spawned[0]?.written).toEqual([])
    expect(ctx.spawned[1]?.written).toEqual(['ls\r'])
    expect(ctx.spawned[1]?.size).toEqual({ cols: 80, rows: 24 })
  })

  test('reports unknown ids instead of throwing', () => {
    expect(ctx.manager.write('missing', 'x')).toBe(false)
    expect(ctx.manager.resize('missing', 80, 24)).toBe(false)
    expect(ctx.manager.kill('missing')).toBe(false)
  })

  test('notifies and forgets a terminal when its process exits', () => {
    const id = ctx.manager.create(request, ctx.events)
    ctx.spawned[0]?.emitExit({ exitCode: 0 })

    expect(ctx.events.onExit).toHaveBeenCalledWith(id, { exitCode: 0 })
    expect(ctx.manager.write(id, 'x')).toBe(false)
    expect(ctx.manager.size).toBe(0)
  })

  test('kill terminates the process', () => {
    const id = ctx.manager.create(request, ctx.events)
    expect(ctx.manager.kill(id)).toBe(true)
    expect(ctx.spawned[0]?.isKilled).toBe(true)
  })

  test('killAll terminates every process', () => {
    ctx.manager.create(request, ctx.events)
    ctx.manager.create(request, ctx.events)
    ctx.manager.killAll()
    expect(ctx.spawned.every((p) => p.isKilled)).toBe(true)
    expect(ctx.manager.size).toBe(0)
  })
})

describe('TerminalManager agent status', () => {
  test('gives claude terminals the hook environment and settings', () => {
    const { manager, spawned, events } = setupWithHooks()
    manager.create(request, events)

    const options = spawned[0]?.options
    expect(options?.args.at(-1)).toContain('--settings "$DUGOUT_CLAUDE_SETTINGS"')
    expect(options?.env).toMatchObject({
      DUGOUT_TERMINAL_ID: 'agent-1',
      DUGOUT_HOOK_SOCKET: '/data/hooks.sock',
      DUGOUT_HOOK_TOKEN: 'tok',
      DUGOUT_CLAUDE_SETTINGS: '/data/claude-hooks.json',
      DUGOUT_CLAUDE_COMMAND: '/opt/fake/claude',
    })
  })

  test('shell terminals get no hook environment', () => {
    const { manager, spawned, events } = setupWithHooks()
    manager.create({ ...request, kind: 'shell' }, events)
    expect(spawned[0]?.options.env).not.toHaveProperty('DUGOUT_HOOK_TOKEN')
  })

  test('claude terminals start in the starting state and follow hook signals', () => {
    const { manager, events, onAgentStatusChange } = setupWithHooks()
    const id = manager.create(request, events)
    expect(manager.agentStatus(id)).toBe('starting')

    manager.applyHookSignal(id, 'ready')
    manager.applyHookSignal(id, 'working')
    manager.applyHookSignal(id, 'needs-input')

    expect(events.onAgentStatus.mock.calls).toEqual([
      [id, 'idle'],
      [id, 'working'],
      [id, 'needs-input'],
    ])
    expect(manager.countAgentsWithStatus('needs-input')).toBe(1)
    expect(onAgentStatusChange).toHaveBeenCalledTimes(3)
    expect(onAgentStatusChange).toHaveBeenLastCalledWith({
      terminalId: id,
      projectId: 'proj-1',
      status: 'needs-input',
    })
  })

  test('repeated signals do not re-emit an unchanged status', () => {
    const { manager, events } = setupWithHooks()
    const id = manager.create(request, events)
    manager.applyHookSignal(id, 'working')
    manager.applyHookSignal(id, 'working')
    expect(events.onAgentStatus).toHaveBeenCalledTimes(1)
  })

  test('ignores signals for unknown or shell terminals', () => {
    const { manager, events } = setupWithHooks()
    const shell = manager.create({ ...request, kind: 'shell' }, events)
    expect(manager.applyHookSignal('missing', 'done')).toBe(false)
    expect(manager.applyHookSignal(shell, 'done')).toBe(false)
    expect(events.onAgentStatus).not.toHaveBeenCalled()
  })

  test('an exited agent no longer counts', () => {
    const { manager, spawned, events } = setupWithHooks()
    const id = manager.create(request, events)
    manager.applyHookSignal(id, 'needs-input')
    spawned[0]?.emitExit({ exitCode: 0 })
    expect(manager.countAgentsWithStatus('needs-input')).toBe(0)
  })
})
