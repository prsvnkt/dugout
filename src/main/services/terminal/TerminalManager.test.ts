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
  const events = { onData: vi.fn(), onExit: vi.fn() }
  return { manager, spawned, events }
}

const request = { kind: 'claude', cwd: '/repo', cols: 100, rows: 30 } as const

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
