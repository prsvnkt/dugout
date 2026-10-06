import { mkdtempSync, statSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HookServer } from './HookServer'

const TOKEN = 'secret-token'

function post(socketPath: string, path: string, token = TOKEN, body = ''): Promise<number> {
  return postFull(socketPath, path, token, body).then((response) => response.status)
}

function postFull(
  socketPath: string,
  path: string,
  token = TOKEN,
  body = '',
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        let text = ''
        res.on('data', (chunk: Buffer) => (text += chunk.toString()))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text }))
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

describe('HookServer', () => {
  let socketPath: string
  let server: HookServer
  const onSignal = vi.fn()
  const onRpc = vi.fn()

  beforeEach(async () => {
    socketPath = join(mkdtempSync(join(tmpdir(), 'dugout-hooks-')), 'hooks.sock')
    onSignal.mockReset()
    onRpc.mockReset()
    server = new HookServer({ socketPath, token: TOKEN, onSignal, onRpc })
    await server.listen()
  })

  afterEach(async () => {
    await server.close()
  })

  test('delivers a valid signal for a terminal', async () => {
    expect(await post(socketPath, '/hooks/term-1/needs-input')).toBe(204)
    expect(onSignal).toHaveBeenCalledWith('term-1', 'needs-input', {})
  })

  test('extracts the session id from a hook payload', async () => {
    const payload = JSON.stringify({ hook_event_name: 'SessionStart', session_id: 'abc-123' })
    expect(await post(socketPath, '/hooks/term-1/ready', TOKEN, payload)).toBe(204)
    expect(onSignal).toHaveBeenCalledWith('term-1', 'ready', { sessionId: 'abc-123' })
  })

  test('ignores malformed payloads and suspicious session ids but keeps the signal', async () => {
    await post(socketPath, '/hooks/t/ready', TOKEN, '{ not json')
    await post(socketPath, '/hooks/t/ready', TOKEN, JSON.stringify({ session_id: '$(whoami)' }))
    expect(onSignal.mock.calls).toEqual([
      ['t', 'ready', {}],
      ['t', 'ready', {}],
    ])
  })

  test.each([
    [
      {
        hook_event_name: 'PermissionRequest',
        tool_name: 'Bash',
        tool_input: { command: 'npm install' },
      },
      'Bash: npm install',
    ],
    [
      {
        hook_event_name: 'PermissionRequest',
        tool_name: 'Edit',
        tool_input: { file_path: '/repo/src/a.ts' },
      },
      'Edit: /repo/src/a.ts',
    ],
    [
      { hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' },
      'Claude needs your permission to use Bash',
    ],
    [
      { hook_event_name: 'Stop', last_assistant_message: 'Fixed the login timeout.\n\nDetails…' },
      'Fixed the login timeout.',
    ],
  ])('extracts a short detail from %o', async (payload, detail) => {
    await post(socketPath, '/hooks/t/done', TOKEN, JSON.stringify(payload))
    expect(onSignal).toHaveBeenCalledWith('t', 'done', { detail })
  })

  test('truncates long details', async () => {
    const payload = { hook_event_name: 'Stop', last_assistant_message: 'x'.repeat(500) }
    await post(socketPath, '/hooks/t/done', TOKEN, JSON.stringify(payload))
    const details = onSignal.mock.calls[0]?.[2] as { detail: string }
    expect(details.detail.length).toBeLessThanOrEqual(140)
  })

  test('rejects oversized payloads', async () => {
    const huge = 'x'.repeat(200 * 1024)
    expect(await post(socketPath, '/hooks/t/ready', TOKEN, huge)).toBe(413)
    expect(onSignal).not.toHaveBeenCalled()
  })

  test('rejects a wrong token', async () => {
    expect(await post(socketPath, '/hooks/term-1/done', 'nope')).toBe(401)
    expect(onSignal).not.toHaveBeenCalled()
  })

  test('rejects unknown signals and paths', async () => {
    expect(await post(socketPath, '/hooks/term-1/explode')).toBe(404)
    expect(await post(socketPath, '/elsewhere')).toBe(404)
    expect(onSignal).not.toHaveBeenCalled()
  })

  test('the socket is only accessible to the current user', () => {
    expect(statSync(socketPath).mode & 0o777).toBe(0o600)
  })

  test('replaces a stale socket file left by a crash', async () => {
    await server.close()
    const { writeFileSync } = await import('node:fs')
    writeFileSync(socketPath, '')
    server = new HookServer({ socketPath, token: TOKEN, onSignal, onRpc })
    await server.listen()
    expect(await post(socketPath, '/hooks/t/ready')).toBe(204)
  })
})

describe('HookServer task RPC', () => {
  let socketPath: string
  let server: HookServer
  const onRpc = vi.fn()

  beforeEach(async () => {
    socketPath = join(mkdtempSync(join(tmpdir(), 'dugout-rpc-')), 'hooks.sock')
    onRpc.mockReset()
    server = new HookServer({ socketPath, token: TOKEN, onSignal: vi.fn(), onRpc })
    await server.listen()
  })

  afterEach(async () => {
    await server.close()
  })

  test('answers task calls for a terminal with JSON', async () => {
    onRpc.mockResolvedValue([{ number: 1 }])
    const response = await postFull(
      socketPath,
      '/rpc/term-1',
      TOKEN,
      JSON.stringify({ method: 'list', params: {} }),
    )
    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ result: [{ number: 1 }] })
    expect(onRpc).toHaveBeenCalledWith('term-1', 'list', {})
  })

  test('returns errors as JSON for the agent to read', async () => {
    onRpc.mockRejectedValue(new Error('This project has no GitHub remote.'))
    const response = await postFull(
      socketPath,
      '/rpc/t',
      TOKEN,
      JSON.stringify({ method: 'list', params: {} }),
    )
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: 'This project has no GitHub remote.' })
  })

  test('requires the token', async () => {
    const response = await postFull(
      socketPath,
      '/rpc/t',
      'wrong',
      JSON.stringify({ method: 'list' }),
    )
    expect(response.status).toBe(401)
    expect(onRpc).not.toHaveBeenCalled()
  })

  test('rejects malformed calls', async () => {
    const response = await postFull(socketPath, '/rpc/t', TOKEN, '{ nope')
    expect(response.status).toBe(400)
    expect(onRpc).not.toHaveBeenCalled()
  })
})
