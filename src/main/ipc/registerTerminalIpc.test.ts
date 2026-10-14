import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { TerminalExit } from '@shared/terminal'
import type { CheckRunner } from '../services/checks/CheckRunner'
import type { SpawnOptions, TerminalProcess } from '../services/terminal/TerminalBackend'
import { TerminalManager, type TerminalSetup } from '../services/terminal/TerminalManager'
import { FakeIpcMain, type FakeSender, silenceIpcLogs } from './fakeIpcMain.testSupport'
import { registerTerminalIpc } from './registerTerminalIpc'

const CWD = mkdtempSync(join(tmpdir(), 'dugout-terminal-ipc-'))
const MAX_WRITE_BYTES = 1024 * 1024

afterAll(() => {
  rmSync(CWD, { recursive: true, force: true })
})

afterEach(() => {
  vi.restoreAllMocks()
})

class FakeProcess implements TerminalProcess {
  readonly pid = 4242
  readonly written: string[] = []
  size: { cols: number; rows: number }
  isKilled = false
  isPaused = false
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

  pause() {
    this.isPaused = true
  }

  resume() {
    this.isPaused = false
  }

  emitData(data: string) {
    this.dataListener?.(data)
  }

  emitExit(exit: TerminalExit) {
    this.exitListener?.(exit)
  }
}

type Listener = (...args: unknown[]) => void

/** The renderer that owns terminals: records every message with all its arguments. */
interface OwnerSender extends FakeSender {
  readonly messages: { channel: string; args: unknown[] }[]
  fire(event: string, ...args: unknown[]): void
}

function ownerSender(id = 1): OwnerSender {
  const listeners = new Map<string, Listener[]>()
  const add = (event: string, listener: Listener) =>
    listeners.set(event, [...(listeners.get(event) ?? []), listener])
  const sender = {
    id,
    sent: [],
    messages: [] as { channel: string; args: unknown[] }[],
    destroyed: false,
    isDestroyed: () => sender.destroyed,
    send(channel: string, ...args: unknown[]) {
      sender.messages.push({ channel, args })
    },
    once: add,
    on: add,
    fire(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
  }
  return sender as unknown as OwnerSender
}

function setup() {
  const spawned: FakeProcess[] = []
  let nextId = 0
  const manager = new TerminalManager({
    backend: {
      spawn: (options) => {
        const process = new FakeProcess(options)
        spawned.push(process)
        return process
      },
    },
    createId: () => `t${++nextId}`,
    env: { SHELL: '/bin/zsh', PATH: '/usr/bin' },
  })
  const checks = { track: vi.fn(), untrack: vi.fn(), agentStatus: vi.fn() }
  const setups = { claimSetup: vi.fn((): TerminalSetup | null => null) }
  const ipc = new FakeIpcMain()
  registerTerminalIpc(manager, checks as unknown as CheckRunner, setups, ipc)
  return { ipc, manager, spawned, checks, setups }
}

type Context = ReturnType<typeof setup>

const shellRequest = { kind: 'shell', projectId: 'p1', cwd: CWD, cols: 80, rows: 24 }

async function createShell(context: Context, sender = ownerSender()) {
  const result = await context.ipc.invoke<string>(IpcChannel.terminalCreate, shellRequest, sender)
  if (!result.ok) throw new Error(result.error)
  const process = context.spawned.at(-1)
  if (!process) throw new Error('Nothing spawned')
  return { id: result.data, process, sender }
}

describe('registerTerminalIpc', () => {
  test('registers every terminal channel', () => {
    const { ipc } = setup()

    expect(ipc.channels()).toEqual(
      [
        IpcChannel.terminalCreate,
        IpcChannel.terminalWithheldServers,
        IpcChannel.terminalWrite,
        IpcChannel.terminalResize,
        IpcChannel.terminalKill,
        IpcChannel.terminalPause,
        IpcChannel.terminalResume,
      ].sort(),
    )
  })
})

describe('terminal:create', () => {
  test('starts a terminal in the folder and tracks it for checks', async () => {
    const context = setup()

    const { id, process } = await createShell(context)

    expect(id).toBe('t1')
    expect(process.options).toMatchObject({ cwd: CWD, cols: 80, rows: 24 })
    expect(context.checks.track).toHaveBeenCalledWith(
      't1',
      { projectId: 'p1', cwd: CWD },
      expect.any(Function),
    )
    expect(context.setups.claimSetup).not.toHaveBeenCalled()
  })

  test('sends output and exit to the renderer that created the terminal', async () => {
    const context = setup()
    const { process, sender } = await createShell(context)

    process.emitData('hello')
    process.emitExit({ exitCode: 0 })

    expect(sender.messages).toEqual([
      { channel: IpcChannel.terminalData, args: ['t1', 'hello'] },
      { channel: IpcChannel.terminalExit, args: ['t1', { exitCode: 0 }] },
    ])
    expect(context.checks.untrack).toHaveBeenCalledWith('t1')
  })

  test('sends nothing to a renderer that is gone', async () => {
    const context = setup()
    const { process, sender } = await createShell(context)
    sender.destroyed = true

    process.emitData('hello')

    expect(sender.messages).toEqual([])
  })

  test('rejects a folder that does not exist without starting anything', async () => {
    silenceIpcLogs()
    const context = setup()
    const missing = join(CWD, 'missing')

    const result = await context.ipc.invoke(IpcChannel.terminalCreate, {
      ...shellRequest,
      cwd: missing,
    })

    expect(result).toEqual({ ok: false, error: `Folder does not exist: ${missing}` })
    expect(context.spawned).toEqual([])
  })

  test.each([
    ['an unknown kind', { kind: 'bash' }],
    ['a relative folder', { cwd: 'repos/demo' }],
    ['a zero size', { cols: 0 }],
    ['a flag-like session id', { resumeSessionId: '--dangerously-skip-permissions' }],
  ])('rejects %s before the manager is called', async (_label, change) => {
    silenceIpcLogs()
    const context = setup()
    const create = vi.spyOn(context.manager, 'create')

    const result = await context.ipc.invoke(IpcChannel.terminalCreate, {
      ...shellRequest,
      ...change,
    })

    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(create).not.toHaveBeenCalled()
  })

  test("claims a new worktree's setup for an agent, and gives it back if the start fails", async () => {
    silenceIpcLogs()
    const context = setup()
    const finish = vi.fn()
    context.setups.claimSetup.mockReturnValue({ command: 'npm ci', finish })
    vi.spyOn(context.manager, 'create').mockImplementation(() => {
      throw new Error('Could not start claude')
    })

    const result = await context.ipc.invoke(IpcChannel.terminalCreate, {
      ...shellRequest,
      kind: 'claude',
    })

    expect(context.setups.claimSetup).toHaveBeenCalledWith(CWD)
    expect(finish).toHaveBeenCalledWith(false)
    expect(result).toEqual({ ok: false, error: 'Could not start claude' })
    expect(context.checks.track).not.toHaveBeenCalled()
  })
})

describe('terminal ownership', () => {
  test("kills a renderer's terminals when it is destroyed", async () => {
    const context = setup()
    const { process, sender } = await createShell(context)

    sender.fire('destroyed')

    expect(process.isKilled).toBe(true)
  })

  test('kills them when the renderer loads a new page, not on in-page navigation', async () => {
    const context = setup()
    const { process, sender } = await createShell(context)

    sender.fire('did-start-navigation', { isMainFrame: true, isSameDocument: true })
    sender.fire('did-start-navigation', { isMainFrame: false, isSameDocument: false })
    expect(process.isKilled).toBe(false)

    sender.fire('did-start-navigation', { isMainFrame: true, isSameDocument: false })
    expect(process.isKilled).toBe(true)
  })

  test("leaves other renderers' terminals running", async () => {
    const context = setup()
    const first = await createShell(context, ownerSender(1))
    const second = await createShell(context, ownerSender(2))

    first.sender.fire('destroyed')

    expect(first.process.isKilled).toBe(true)
    expect(second.process.isKilled).toBe(false)
  })
})

describe('terminal:withheld-servers', () => {
  test.each([
    ['a shell', 't1'],
    ['an unknown terminal', 'nope'],
  ])('is null for %s', async (_label, id) => {
    const context = setup()
    await createShell(context)

    const result = await context.ipc.invoke(IpcChannel.terminalWithheldServers, { id })

    expect(result).toEqual({ ok: true, data: null })
  })

  test('rejects an empty id before the manager is called', async () => {
    silenceIpcLogs()
    const context = setup()
    const withheld = vi.spyOn(context.manager, 'withheldServers')

    const result = await context.ipc.invoke(IpcChannel.terminalWithheldServers, { id: '' })

    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(withheld).not.toHaveBeenCalled()
  })
})

type InputMethod = 'write' | 'resize' | 'kill' | 'pause' | 'resume'

describe('fire-and-forget terminal input', () => {
  test('forwards keystrokes, size, pause, resume and kill to the terminal', async () => {
    const context = setup()
    const { id, process } = await createShell(context)

    context.ipc.emit(IpcChannel.terminalWrite, undefined, { id, data: 'ls\r' })
    context.ipc.emit(IpcChannel.terminalResize, undefined, { id, cols: 120, rows: 40 })
    context.ipc.emit(IpcChannel.terminalPause, undefined, { id })
    const wasPaused = process.isPaused
    context.ipc.emit(IpcChannel.terminalResume, undefined, { id })
    context.ipc.emit(IpcChannel.terminalKill, undefined, { id })

    expect(process.written).toEqual(['ls\r'])
    expect(process.size).toEqual({ cols: 120, rows: 40 })
    expect(wasPaused).toBe(true)
    expect(process.isPaused).toBe(false)
    expect(process.isKilled).toBe(true)
  })

  const invalid: [string, string, unknown, InputMethod][] = [
    ['write without data', IpcChannel.terminalWrite, { id: 't1' }, 'write'],
    [
      'write over the size limit',
      IpcChannel.terminalWrite,
      { id: 't1', data: 'x'.repeat(MAX_WRITE_BYTES + 1) },
      'write',
    ],
    [
      'resize to a fraction',
      IpcChannel.terminalResize,
      { id: 't1', cols: 1.5, rows: 24 },
      'resize',
    ],
    [
      'resize past the limit',
      IpcChannel.terminalResize,
      { id: 't1', cols: 80, rows: 5000 },
      'resize',
    ],
    ['kill without an id', IpcChannel.terminalKill, {}, 'kill'],
    ['pause with a number id', IpcChannel.terminalPause, { id: 1 }, 'pause'],
    ['resume without a payload', IpcChannel.terminalResume, undefined, 'resume'],
  ]

  test.each(invalid)(
    'rejects %s before the manager is called',
    async (_label, channel, payload, method) => {
      const { warn } = silenceIpcLogs()
      const context = setup()
      const { process } = await createShell(context)
      const call = vi.spyOn(context.manager, method)

      context.ipc.emit(channel, undefined, payload)

      expect(call).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledOnce()
      expect(process.written).toEqual([])
      expect(process.isKilled).toBe(false)
    },
  )

  const unknown: [string, unknown, InputMethod][] = [
    [IpcChannel.terminalWrite, { id: 'gone', data: 'x' }, 'write'],
    [IpcChannel.terminalResize, { id: 'gone', cols: 80, rows: 24 }, 'resize'],
    [IpcChannel.terminalKill, { id: 'gone' }, 'kill'],
    [IpcChannel.terminalPause, { id: 'gone' }, 'pause'],
    [IpcChannel.terminalResume, { id: 'gone' }, 'resume'],
  ]

  test.each(unknown)('%s for an unknown terminal is a no-op', async (channel, payload, method) => {
    const context = setup()
    const { process } = await createShell(context)
    const call = vi.spyOn(context.manager, method)

    context.ipc.emit(channel, undefined, payload)

    expect(call).toHaveReturnedWith(false)
    expect(process.written).toEqual([])
    expect(process.size).toEqual({ cols: 80, rows: 24 })
    expect(process.isPaused).toBe(false)
    expect(process.isKilled).toBe(false)
  })
})
