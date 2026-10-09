import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { TerminalExit } from '@shared/terminal'
import { EMPTY_TOTALS } from '@shared/usage'
import type { SpawnOptions, TerminalBackend, TerminalProcess } from './TerminalBackend'
import { TerminalManager } from './TerminalManager'

/** Hook tokens that are predictable per terminal (`tok-<id>`), recording revocations. */
function fakeTokens() {
  const revoked: string[] = []
  return {
    revoked,
    issue: (terminalId: string) => `tok-${terminalId}`,
    revoke: (terminalId: string) => void revoked.push(terminalId),
  }
}

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
      dataDir: '/data',
      socketPath: '/data/hooks.sock',
      tokens: fakeTokens(),
      commands: { claude: '/opt/fake/claude' },
    },
    onAgentStatusChange,
  })
  const events = {
    onData: vi.fn(),
    onExit: vi.fn(),
    onAgentStatus: vi.fn(),
    onAgentSession: vi.fn(),
    onAgentSubagent: vi.fn(),
  }
  return { manager, spawned, events, onAgentStatusChange }
}

/** Dugout's task server, as `setupAgentHooks` passes it. */
const MCP_SERVER = { command: '/Apps/Dugout', script: '/out/main/mcp.js' }

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
      DUGOUT_HOOK_TOKEN: 'tok-agent-1',
      DUGOUT_CLAUDE_SETTINGS: '/data/claude-hooks.json',
      DUGOUT_CLAUDE_COMMAND: '/opt/fake/claude',
    })
  })

  test('shell terminals get no hook environment', () => {
    const { manager, spawned, events } = setupWithHooks()
    manager.create({ ...request, kind: 'shell' }, events)
    expect(spawned[0]?.options.env).not.toHaveProperty('DUGOUT_HOOK_TOKEN')
  })

  test('gives a dev server shell its assigned PORT', () => {
    const { manager, spawned, events } = setupWithHooks()

    manager.create({ ...request, kind: 'shell', port: 4101 }, events)
    manager.create({ ...request, kind: 'shell' }, events)

    expect(spawned[0]?.options.env.PORT).toBe('4101')
    expect(spawned[0]?.options.args).toEqual(['-l'])
    expect(spawned[1]?.options.env).not.toHaveProperty('PORT')
  })

  test('claude terminals start in the starting state and follow hook signals', () => {
    const { manager, events, onAgentStatusChange } = setupWithHooks()
    const id = manager.create(request, events)
    expect(manager.agentStatus(id)).toBe('starting')

    manager.applyHookSignal(id, 'ready')
    manager.applyHookSignal(id, 'working')
    manager.applyHookSignal(id, 'needs-input')

    expect(events.onAgentStatus.mock.calls.map((call) => call.slice(0, 2))).toEqual([
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

  test('forwards subagent updates for agents only, leaving the status alone', () => {
    const { manager, events } = setupWithHooks()
    const agent = manager.create(request, events)
    const shellSetup = setupWithHooks()
    const shell = shellSetup.manager.create({ ...request, kind: 'shell' }, shellSetup.events)
    const update = { id: 'a-1', type: 'Explore', state: 'running' } as const

    expect(manager.applySubagent(agent, update)).toBe(true)
    expect(manager.applySubagent('missing', update)).toBe(false)
    expect(shellSetup.manager.applySubagent(shell, update)).toBe(false)

    expect(events.onAgentSubagent.mock.calls).toEqual([[agent, update]])
    expect(shellSetup.events.onAgentSubagent).not.toHaveBeenCalled()
    expect(events.onAgentStatus).not.toHaveBeenCalled()
  })

  test('ignores signals for unknown or shell terminals', () => {
    const { manager, events } = setupWithHooks()
    const shell = manager.create({ ...request, kind: 'shell' }, events)
    expect(manager.applyHookSignal('missing', 'done')).toBe(false)
    expect(manager.applyHookSignal(shell, 'done')).toBe(false)
    expect(events.onAgentStatus).not.toHaveBeenCalled()
  })

  test('describes an agent terminal for usage: project, checkout, task and session', () => {
    // Arrange
    const { manager, events } = setupWithHooks()
    const id = manager.create({ ...request, taskNumber: 12 }, events)
    const shellSetup = setupWithHooks()
    const shell = shellSetup.manager.create({ ...request, kind: 'shell' }, shellSetup.events)

    // Act
    manager.applyHookSignal(id, 'ready', { sessionId: 's-1' })

    // Assert
    expect(manager.agentInfo(id)).toEqual({
      kind: 'claude',
      projectId: 'proj-1',
      cwd: '/repo',
      taskNumber: 12,
      sessionId: 's-1',
    })
    expect(shellSetup.manager.agentInfo(shell)).toBeNull()
    expect(manager.agentInfo('missing')).toBeNull()
  })

  test('passes usage on to the terminal’s renderer', () => {
    const { manager, events } = setupWithHooks()
    const onAgentUsage = vi.fn()
    const id = manager.create(request, { ...events, onAgentUsage })
    const usage = { sessionId: 's-1', totals: EMPTY_TOTALS, model: null, context: null }

    expect(manager.reportUsage(id, usage)).toBe(true)
    expect(manager.reportUsage('missing', usage)).toBe(false)
    expect(onAgentUsage).toHaveBeenCalledWith(id, usage)
  })

  test('an exited agent no longer counts', () => {
    const { manager, spawned, events } = setupWithHooks()
    const id = manager.create(request, events)
    manager.applyHookSignal(id, 'needs-input')
    spawned[0]?.emitExit({ exitCode: 0 })
    expect(manager.countAgentsWithStatus('needs-input')).toBe(0)
  })
})

describe('TerminalManager sessions', () => {
  test('resumes a previous Claude session when asked', () => {
    const { manager, spawned, events } = setupWithHooks()
    manager.create({ ...request, resumeSessionId: 'sess-1' }, events)
    expect(spawned[0]?.options.env.DUGOUT_RESUME_SESSION).toBe('sess-1')
  })

  test('starts fresh without a resume id', () => {
    const { manager, spawned, events } = setupWithHooks()
    manager.create(request, events)
    expect(spawned[0]?.options.env).not.toHaveProperty('DUGOUT_RESUME_SESSION')
    expect(spawned[0]?.options.args.at(-1)).not.toContain('--resume')
  })

  test('the resume flag is part of the launch line only when resuming', () => {
    const { manager, spawned, events } = setupWithHooks()
    manager.create({ ...request, resumeSessionId: 'sess-1' }, events)
    expect(spawned[0]?.options.args.at(-1)).toContain('--resume "$DUGOUT_RESUME_SESSION"')
  })

  test('defaults the claude command to "claude" on PATH', () => {
    const spawned: FakeProcess[] = []
    const manager = new TerminalManager({
      backend: {
        spawn: (options) => {
          const process = new FakeProcess(options)
          spawned.push(process)
          return process
        },
      },
      createId: () => 't',
      env: {},
      agentHooks: { dataDir: '/data', socketPath: '/h.sock', tokens: fakeTokens() },
    })
    manager.create(request, { onData: vi.fn(), onExit: vi.fn() })
    expect(spawned[0]?.options.env.DUGOUT_CLAUDE_COMMAND).toBe('claude')
  })

  test('reports a session only once its conversation has started (empty ones cannot resume)', () => {
    const { manager, events } = setupWithHooks()
    const id = manager.create(request, events)

    manager.applyHookSignal(id, 'ready', { sessionId: 'sess-1' })
    expect(events.onAgentSession).not.toHaveBeenCalled()

    manager.applyHookSignal(id, 'working')
    manager.applyHookSignal(id, 'done')
    expect(events.onAgentSession.mock.calls).toEqual([[id, 'sess-1']])
  })

  test('a new session (e.g. after /clear) is reported once it has a conversation', () => {
    const { manager, events } = setupWithHooks()
    const id = manager.create(request, events)
    manager.applyHookSignal(id, 'ready', { sessionId: 'sess-1' })
    manager.applyHookSignal(id, 'working')

    manager.applyHookSignal(id, 'ready', { sessionId: 'sess-2' })
    expect(events.onAgentSession.mock.calls).toEqual([[id, 'sess-1']])
    manager.applyHookSignal(id, 'working')
    expect(events.onAgentSession.mock.calls).toEqual([
      [id, 'sess-1'],
      [id, 'sess-2'],
    ])
  })

  test('a resumed session already has a conversation, so it is reported when ready', () => {
    const { manager, events } = setupWithHooks()
    const id = manager.create({ ...request, resumeSessionId: 'old' }, events)
    manager.applyHookSignal(id, 'ready', { sessionId: 'resumed' })
    expect(events.onAgentSession.mock.calls).toEqual([[id, 'resumed']])
  })
})

describe('TerminalManager task sessions', () => {
  function setupWithMcp() {
    const spawned: FakeProcess[] = []
    const written: string[] = []
    const removed: string[] = []
    const manager = new TerminalManager({
      backend: {
        spawn: (options) => {
          const process = new FakeProcess(options)
          spawned.push(process)
          return process
        },
      },
      createId: () => 'agent-9',
      env: {},
      agentHooks: {
        dataDir: '/data',
        socketPath: '/h.sock',
        tokens: fakeTokens(),
        mcp: {
          server: MCP_SERVER,
          files: {
            write: (id) => {
              written.push(id)
              return `/mcp/${id}.json`
            },
            remove: (id) => removed.push(id),
          },
        },
      },
    })
    return { manager, spawned, written, removed }
  }

  test('gives each claude terminal its own MCP config, removed when it exits', () => {
    const { manager, spawned, written, removed } = setupWithMcp()
    manager.create(request, { onData: vi.fn(), onExit: vi.fn() })

    expect(written).toEqual(['agent-9'])
    expect(spawned[0]?.options.env.DUGOUT_MCP_CONFIG).toBe('/mcp/agent-9.json')
    expect(spawned[0]?.options.args.at(-1)).toContain('--mcp-config "$DUGOUT_MCP_CONFIG"')

    spawned[0]?.emitExit({ exitCode: 0 })
    expect(removed).toEqual(['agent-9'])
  })

  test('passes a first prompt to a new session', () => {
    const { manager, spawned } = setupWithMcp()
    manager.create({ ...request, initialPrompt: 'Fix #42' }, { onData: vi.fn(), onExit: vi.fn() })
    expect(spawned[0]?.options.env.DUGOUT_INITIAL_PROMPT).toBe('Fix #42')
    expect(spawned[0]?.options.args.at(-1)).toContain('"$DUGOUT_INITIAL_PROMPT"')
  })

  test('a resumed session never gets the first prompt again', () => {
    const { manager, spawned } = setupWithMcp()
    manager.create(
      { ...request, initialPrompt: 'Fix #42', resumeSessionId: 's1' },
      { onData: vi.fn(), onExit: vi.fn() },
    )
    expect(spawned[0]?.options.env).not.toHaveProperty('DUGOUT_INITIAL_PROMPT')
  })

  test('knows which project a terminal belongs to', () => {
    const { manager } = setupWithMcp()
    const id = manager.create(request, { onData: vi.fn(), onExit: vi.fn() })
    expect(manager.projectOf(id)).toBe('proj-1')
    expect(manager.projectOf('missing')).toBeNull()
  })
})

describe('TerminalManager status details', () => {
  test('passes what the agent is asking or reporting along with the status', () => {
    const { manager, events, onAgentStatusChange } = setupWithHooks()
    const id = manager.create(request, events)

    manager.applyHookSignal(id, 'needs-input', { detail: 'Bash: npm install' })

    expect(events.onAgentStatus).toHaveBeenLastCalledWith(
      id,
      'needs-input',
      'Bash: npm install',
      [],
    )
    expect(onAgentStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'needs-input', detail: 'Bash: npm install' }),
    )
  })
})

describe('TerminalManager pending approvals', () => {
  const preview = (command: string) =>
    ({ kind: 'command', tool: 'Bash', command, description: null }) as const
  const ask = (command: string) => ({
    detail: `Bash: ${command}`,
    toolCall: { toolUseId: null, key: `Bash\u0000${command}` },
    preview: preview(command),
  })
  const finished = (command: string, id: string) => ({
    toolCall: { toolUseId: id, key: `Bash\u0000${command}` },
  })

  function asking(...commands: string[]) {
    const setup = setupWithHooks()
    const id = setup.manager.create(request, setup.events)
    setup.manager.applyHookSignal(id, 'working')
    for (const command of commands) setup.manager.applyHookSignal(id, 'needs-input', ask(command))
    return { ...setup, id }
  }

  test('stays "needs you" while a parallel tool that needed no approval finishes', () => {
    // Arrange
    const { manager, events, id } = asking('npm install')

    // Act
    manager.applyHookSignal(id, 'tool-done', finished('ls', 'toolu_ls'))

    // Assert
    expect(manager.agentStatus(id)).toBe('needs-input')
    expect(events.onAgentStatus).toHaveBeenLastCalledWith(id, 'needs-input', 'Bash: npm install', [
      preview('npm install'),
    ])
  })

  test('works again once the approved tool finishes', () => {
    const { manager, events, id } = asking('npm install')

    manager.applyHookSignal(id, 'tool-done', finished('npm install', 'toolu_1'))

    expect(manager.agentStatus(id)).toBe('working')
    expect(events.onAgentStatus).toHaveBeenLastCalledWith(id, 'working', undefined, [])
  })

  test('with two approvals pending, shows the one still waiting after the other finishes', () => {
    const { manager, events, onAgentStatusChange, id } = asking('npm install', 'npm test')
    expect(events.onAgentStatus).toHaveBeenLastCalledWith(id, 'needs-input', 'Bash: npm install', [
      preview('npm install'),
      preview('npm test'),
    ])
    const notified = onAgentStatusChange.mock.calls.length

    manager.applyHookSignal(id, 'tool-done', finished('npm install', 'toolu_1'))

    expect(manager.agentStatus(id)).toBe('needs-input')
    expect(events.onAgentStatus).toHaveBeenLastCalledWith(id, 'needs-input', 'Bash: npm test', [
      preview('npm test'),
    ])
    expect(onAgentStatusChange).toHaveBeenCalledTimes(notified + 1)

    manager.applyHookSignal(id, 'tool-done', finished('npm test', 'toolu_2'))
    expect(manager.agentStatus(id)).toBe('working')
  })

  test('a second approval updates the list without notifying again', () => {
    const { manager, onAgentStatusChange, id } = asking('npm install')
    const notified = onAgentStatusChange.mock.calls.length

    manager.applyHookSignal(id, 'needs-input', ask('npm test'))

    expect(onAgentStatusChange).toHaveBeenCalledTimes(notified)
  })

  test("the permission notification after a request keeps the tool call's detail", () => {
    const { manager, events, id } = asking('npm install')
    const emitted = events.onAgentStatus.mock.calls.length

    manager.applyHookSignal(id, 'needs-input', {
      detail: 'Claude needs your permission to use Bash',
    })

    expect(events.onAgentStatus).toHaveBeenCalledTimes(emitted)
  })

  test('the end of the turn clears pending approvals', () => {
    const { manager, events, id } = asking('npm install', 'npm test')

    manager.applyHookSignal(id, 'done', { detail: 'Finished.' })
    manager.applyHookSignal(id, 'working')

    expect(manager.agentStatus(id)).toBe('working')
    expect(events.onAgentStatus).toHaveBeenLastCalledWith(id, 'working', undefined, [])
  })
})

describe('TerminalManager codex terminals', () => {
  function setupCodex() {
    const spawned: FakeProcess[] = []
    const written: string[] = []
    const manager = new TerminalManager({
      backend: {
        spawn: (options) => {
          const process = new FakeProcess(options)
          spawned.push(process)
          return process
        },
      },
      createId: () => 'cx-1',
      env: {},
      agentHooks: {
        dataDir: '/data',
        socketPath: '/h.sock',
        tokens: fakeTokens(),
        mcp: {
          server: MCP_SERVER,
          files: {
            write: (id) => {
              written.push(id)
              return `/mcp/${id}.json`
            },
            remove: () => undefined,
          },
        },
      },
    })
    const events = { onData: vi.fn(), onExit: vi.fn(), onAgentStatus: vi.fn() }
    return { manager, spawned, written, events }
  }

  test('passes each config override in its own variable and tracks status like Claude', () => {
    const { manager, spawned, written, events } = setupCodex()
    const id = manager.create({ ...request, kind: 'codex' }, events)

    const env = spawned[0]?.options.env
    const overrides = Object.keys(env ?? {}).filter((key) => /^DUGOUT_CODEX_C\d+$/.test(key))
    expect(env?.DUGOUT_CODEX_COMMAND).toBe('codex')
    expect(env?.DUGOUT_CODEX_C0).toMatch(/^hooks\.SessionStart=/)
    expect(env?.[`DUGOUT_CODEX_C${overrides.length - 1}`]).toMatch(/^mcp_servers\.dugout=.*"cx-1"/)
    expect(env).not.toHaveProperty('DUGOUT_CLAUDE_SETTINGS')
    expect(written).toEqual([])

    expect(manager.agentStatus(id)).toBe('starting')
    manager.applyHookSignal(id, 'needs-input')
    expect(events.onAgentStatus).toHaveBeenCalledWith(id, 'needs-input', undefined, [])
  })
})

describe('TerminalManager OpenCode terminals', () => {
  test('get the shared hook variables, their inline config, and status like any agent', () => {
    const { manager, spawned, events } = setupWithHooks()
    const id = manager.create({ ...request, kind: 'opencode' }, events)

    const env = spawned[0]?.options.env
    expect(spawned[0]?.options.args.at(-1)).toBe('"$DUGOUT_OPENCODE_COMMAND"')
    expect(env).toMatchObject({
      DUGOUT_TERMINAL_ID: 'agent-1',
      DUGOUT_HOOK_TOKEN: 'tok-agent-1',
      DUGOUT_OPENCODE_COMMAND: 'opencode',
    })
    expect(JSON.parse(env?.OPENCODE_CONFIG_CONTENT ?? '{}').plugin).toHaveLength(1)
    expect(manager.agentStatus(id)).toBe('starting')
    manager.applyHookSignal(id, 'ready')
    expect(manager.agentStatus(id)).toBe('idle')
  })
})

describe('TerminalManager worktree setup', () => {
  function withSetup() {
    const ctx = setupWithHooks()
    const setup = { command: 'npm install', finish: vi.fn() }
    const id = ctx.manager.create(request, ctx.events, setup)
    return { ...ctx, setup, id }
  }

  test('runs the setup command in the terminal before the agent', () => {
    // Act
    const { spawned, events, id } = withSetup()
    spawned[0]?.emitData('added 12 packages')

    // Assert
    expect(spawned).toHaveLength(1)
    expect(spawned[0]?.options.args).toEqual([
      '-l',
      '-i',
      '-c',
      'echo "$DUGOUT_SETUP_BANNER" && eval "$DUGOUT_SETUP_COMMAND"',
    ])
    expect(spawned[0]?.options.env.DUGOUT_SETUP_COMMAND).toBe('npm install')
    expect(spawned[0]?.options.cwd).toBe('/repo')
    expect(events.onData).toHaveBeenCalledWith(id, 'added 12 packages')
  })

  test('starts the agent at the latest size once the setup succeeds', () => {
    // Arrange
    const { manager, spawned, events, setup, id } = withSetup()
    manager.resize(id, 120, 40)

    // Act
    spawned[0]?.emitExit({ exitCode: 0 })
    spawned[1]?.emitData('agent ready')

    // Assert
    expect(setup.finish).toHaveBeenCalledWith(true)
    expect(events.onExit).not.toHaveBeenCalled()
    expect(spawned[1]?.options.args.at(-1)).toContain('"$DUGOUT_CLAUDE_COMMAND"')
    expect(spawned[1]?.options.env).not.toHaveProperty('DUGOUT_SETUP_COMMAND')
    expect(spawned[1]?.options).toMatchObject({ cols: 120, rows: 40 })
    expect(events.onData).toHaveBeenCalledWith(id, 'agent ready')
    expect(manager.write(id, 'hi')).toBe(true)
    expect(spawned[1]?.written).toEqual(['hi'])
    expect(manager.agentStatus(id)).toBe('starting')
  })

  test('shows the failure and ends the terminal when the setup fails', () => {
    // Arrange
    const { manager, spawned, events, setup, id } = withSetup()

    // Act
    spawned[0]?.emitExit({ exitCode: 1 })

    // Assert
    expect(spawned).toHaveLength(1)
    expect(setup.finish).toHaveBeenCalledWith(false)
    expect(events.onData).toHaveBeenCalledWith(id, expect.stringContaining('setup failed'))
    expect(events.onExit).toHaveBeenCalledWith(id, { exitCode: 1 })
    expect(manager.size).toBe(0)
  })

  test('never starts the agent when the terminal is closed during setup', () => {
    // Arrange
    const { manager, spawned, setup, id } = withSetup()

    // Act
    manager.kill(id)
    spawned[0]?.emitExit({ exitCode: 0, signal: 1 })

    // Assert
    expect(spawned[0]?.isKilled).toBe(true)
    expect(spawned).toHaveLength(1)
    expect(setup.finish).toHaveBeenCalledWith(false)
  })

  test('never starts the agent after killAll, even if the setup then exits cleanly', () => {
    // Arrange
    const { manager, spawned, setup } = withSetup()

    // Act
    manager.killAll()
    spawned[0]?.emitExit({ exitCode: 0 })

    // Assert
    expect(spawned).toHaveLength(1)
    expect(setup.finish).toHaveBeenCalledWith(false)
  })
})

describe('TerminalManager hook tokens (decision 059)', () => {
  function setupAgents() {
    const spawned: FakeProcess[] = []
    const files = new Map<string, string>()
    const tokens = fakeTokens()
    let nextId = 0
    const manager = new TerminalManager({
      backend: {
        spawn: (options) => {
          const process = new FakeProcess(options)
          spawned.push(process)
          return process
        },
      },
      createId: () => `a${++nextId}`,
      env: { DUGOUT_HOOK_TOKEN: 'inherited-from-the-app' },
      agentHooks: {
        dataDir: '/data',
        socketPath: '/h.sock',
        tokens,
        mcp: {
          server: MCP_SERVER,
          files: {
            write: (id, content) => {
              files.set(id, content)
              return `/mcp/${id}.json`
            },
            remove: (id) => files.delete(id),
          },
        },
      },
    })
    const events = { onData: vi.fn(), onExit: vi.fn() }
    return { manager, spawned, files, tokens, events }
  }

  test.each(['claude', 'codex', 'opencode'] as const)(
    'each %s terminal gets only its own token, and only in DUGOUT_HOOK_TOKEN',
    (kind) => {
      // Arrange
      const { manager, spawned, files, events } = setupAgents()

      // Act
      const first = manager.create({ ...request, kind }, events)
      const second = manager.create({ ...request, kind }, events)

      // Assert
      const [envA, envB] = [spawned[0]?.options.env ?? {}, spawned[1]?.options.env ?? {}]
      expect(envA.DUGOUT_HOOK_TOKEN).toBe(`tok-${first}`)
      expect(envB.DUGOUT_HOOK_TOKEN).toBe(`tok-${second}`)
      for (const [env, own, other] of [
        [envA, first, second],
        [envB, second, first],
      ] as const) {
        const { DUGOUT_HOOK_TOKEN: _own, ...rest } = env
        const everythingElse = [...Object.values(rest), files.get(own) ?? ''].join('\n')
        expect(everythingElse).not.toContain(`tok-${own}`)
        expect(everythingElse).not.toContain(`tok-${other}`)
        expect(everythingElse).not.toContain('inherited-from-the-app')
      }
    },
  )

  test("the dugout MCP server reads the token from the agent's env, never from its config", () => {
    const { manager, spawned, files, events } = setupAgents()
    const claude = manager.create(request, events)
    manager.create({ ...request, kind: 'codex' }, events)

    const claudeServer = JSON.parse(files.get(claude) ?? '{}').mcpServers.dugout
    expect(claudeServer.env).toMatchObject({ DUGOUT_TERMINAL_ID: claude })
    expect(claudeServer.env).not.toHaveProperty('DUGOUT_HOOK_TOKEN')
    const codexEnv = spawned[1]?.options.env ?? {}
    const dugoutOverride = Object.values(codexEnv).find((value) =>
      value.startsWith('mcp_servers.dugout='),
    )
    expect(dugoutOverride).toContain('env_vars = ["DUGOUT_HOOK_TOKEN"]')
  })

  test("forgets a terminal's token when it exits", () => {
    const { manager, spawned, tokens, events } = setupAgents()
    const id = manager.create(request, events)
    expect(tokens.revoked).toEqual([])

    spawned[0]?.emitExit({ exitCode: 0 })

    expect(tokens.revoked).toEqual([id])
  })

  test('forgets the token when a worktree setup fails, so the agent never starts', () => {
    const { manager, spawned, tokens, events } = setupAgents()
    const id = manager.create(request, events, { command: 'false', finish: vi.fn() })

    spawned[0]?.emitExit({ exitCode: 1 })

    expect(tokens.revoked).toEqual([id])
  })

  test('shells get no token', () => {
    const { manager, spawned, events } = setupAgents()
    manager.create({ ...request, kind: 'shell' }, events)
    expect(spawned[0]?.options.env).not.toHaveProperty('DUGOUT_HOOK_TOKEN')
  })
})
