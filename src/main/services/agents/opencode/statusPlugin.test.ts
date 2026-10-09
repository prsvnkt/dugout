import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { OPENCODE_STATUS_PLUGIN } from './statusPlugin'

interface Hooks {
  event?: (input: { event: { type: string; properties: unknown } }) => Promise<void>
  'tool.execute.after'?: (input: unknown, output: unknown) => Promise<void>
}
type Plugin = () => Promise<Hooks>

interface Sent {
  readonly url: string
  readonly unix: unknown
  readonly auth: unknown
  readonly body: unknown
}

const ENV = {
  DUGOUT_TERMINAL_ID: 't-1',
  DUGOUT_HOOK_SOCKET: '/data/hooks.sock',
  DUGOUT_HOOK_TOKEN: 'tok',
}

async function loadPlugin(): Promise<Plugin> {
  const file = join(mkdtempSync(join(tmpdir(), 'dugout-plugin-')), 'opencode-status.mjs')
  writeFileSync(file, OPENCODE_STATUS_PLUGIN)
  const module = (await import(pathToFileURL(file).href)) as { DugoutStatus: Plugin }
  return module.DugoutStatus
}

let sent: Sent[]

beforeEach(() => {
  sent = []
  vi.stubGlobal('fetch', (url: string, init: Record<string, unknown>) => {
    const headers = init.headers as Record<string, string>
    const body = typeof init.body === 'string' && init.body ? JSON.parse(init.body) : null
    sent.push({ url, unix: init.unix, auth: headers.Authorization, body })
    return Promise.resolve(new Response(null, { status: 204 }))
  })
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/** Runs the plugin through `events`, then waits for its queued signals. */
async function run(events: { type: string; properties: unknown }[]): Promise<Sent[]> {
  const hooks = await (await loadPlugin())()
  for (const event of events) await hooks.event?.({ event })
  await vi.waitFor(() => expect(sent.length).toBeGreaterThan(events.length > 0 ? 1 : 0))
  await new Promise((resolve) => setTimeout(resolve, 10))
  return sent
}

const signals = (list: Sent[]) => list.map((item) => item.url.split('/').at(-1))
const status = (sessionID: string, type: string) => ({
  type: 'session.status',
  properties: { sessionID, status: { type } },
})

describe('OpenCode status plugin', () => {
  test('reports ready to its terminal over the hook socket with the token', async () => {
    const list = await run([])
    expect(list[0]).toEqual({
      url: 'http://dugout/hooks/t-1/ready',
      unix: '/data/hooks.sock',
      auth: 'Bearer tok',
      body: null,
    })
  })

  test('a busy turn is working, and going idle afterwards is done', async () => {
    const list = await run([
      status('ses_1', 'busy'),
      status('ses_1', 'busy'),
      status('ses_1', 'idle'),
    ])
    expect(signals(list)).toEqual(['ready', 'working', 'done'])
    expect(list[1]?.body).toEqual({ session_id: 'ses_1' })
    expect(list[2]?.body).toEqual({ hook_event_name: 'Stop', session_id: 'ses_1' })
  })

  test("ignores subagent sessions' turns", async () => {
    const list = await run([
      { type: 'session.created', properties: { info: { id: 'ses_child', parentID: 'ses_1' } } },
      status('ses_child', 'busy'),
      status('ses_child', 'idle'),
      status('ses_1', 'busy'),
    ])
    expect(signals(list)).toEqual(['ready', 'working'])
  })

  test('a permission request needs you, as a tool call that its reply finishes', async () => {
    const asked = {
      id: 'per_1',
      sessionID: 'ses_1',
      permission: 'bash',
      patterns: ['npm install'],
      metadata: { command: 'npm install' },
      tool: { messageID: 'msg_1', callID: 'call_1' },
    }
    const list = await run([
      { type: 'permission.asked', properties: asked },
      {
        type: 'permission.replied',
        properties: { sessionID: 'ses_1', requestID: 'per_1', reply: 'once' },
      },
    ])
    const tool = {
      tool_name: 'bash',
      tool_use_id: 'call_1',
      tool_input: { command: 'npm install' },
    }
    expect(signals(list)).toEqual(['ready', 'needs-input', 'tool-done'])
    expect(list[1]?.body).toEqual({
      hook_event_name: 'PermissionRequest',
      session_id: 'ses_1',
      ...tool,
    })
    expect(list[2]?.body).toEqual({ hook_event_name: 'PostToolUse', session_id: 'ses_1', ...tool })
  })

  test('names the edited file the way the inbox expects', async () => {
    const asked = {
      id: 'per_2',
      sessionID: 'ses_1',
      permission: 'edit',
      metadata: { filepath: '/repo/a.ts', diff: '-a\n+b' },
    }
    const list = await run([{ type: 'permission.asked', properties: asked }])
    expect(list[1]?.body).toMatchObject({
      tool_use_id: 'per_2',
      tool_input: { file_path: '/repo/a.ts', filepath: '/repo/a.ts' },
    })
  })

  test('a question needs you until it is answered', async () => {
    const list = await run([
      { type: 'question.asked', properties: { id: 'que_1', sessionID: 'ses_1' } },
      { type: 'question.replied', properties: { requestID: 'que_1', sessionID: 'ses_1' } },
    ])
    expect(signals(list)).toEqual(['ready', 'needs-input', 'tool-done'])
    expect(list[1]?.body).toMatchObject({ hook_event_name: 'Notification' })
  })

  test('a finished tool reports its call id', async () => {
    const hooks = await (await loadPlugin())()
    await hooks['tool.execute.after']?.(
      { tool: 'bash', sessionID: 'ses_1', callID: 'call_9', args: { command: 'ls' } },
      { title: '', output: '', metadata: {} },
    )
    await vi.waitFor(() => expect(sent).toHaveLength(2))
    expect(sent[1]?.body).toEqual({
      hook_event_name: 'PostToolUse',
      session_id: 'ses_1',
      tool_name: 'bash',
      tool_use_id: 'call_9',
      tool_input: { command: 'ls' },
    })
  })

  test('does nothing outside a Dugout terminal, and never throws when Dugout is gone', async () => {
    vi.stubEnv('DUGOUT_TERMINAL_ID', '')
    expect(await (await loadPlugin())()).toEqual({})

    vi.stubEnv('DUGOUT_TERMINAL_ID', 't-1')
    vi.stubGlobal('fetch', () => Promise.reject(new Error('ECONNREFUSED')))
    const hooks = await (await loadPlugin())()
    await expect(hooks.event?.({ event: status('ses_1', 'busy') })).resolves.toBeUndefined()
  })
})
