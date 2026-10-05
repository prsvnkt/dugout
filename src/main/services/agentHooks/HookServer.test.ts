import { mkdtempSync, statSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { HookServer } from './HookServer'

const TOKEN = 'secret-token'

function post(socketPath: string, path: string, token = TOKEN): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(
      { socketPath, path, method: 'POST', headers: { Authorization: `Bearer ${token}` } },
      (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      },
    )
    req.on('error', reject)
    req.end()
  })
}

describe('HookServer', () => {
  let socketPath: string
  let server: HookServer
  const onSignal = vi.fn()

  beforeEach(async () => {
    socketPath = join(mkdtempSync(join(tmpdir(), 'dugout-hooks-')), 'hooks.sock')
    onSignal.mockReset()
    server = new HookServer({ socketPath, token: TOKEN, onSignal })
    await server.listen()
  })

  afterEach(async () => {
    await server.close()
  })

  test('delivers a valid signal for a terminal', async () => {
    expect(await post(socketPath, '/hooks/term-1/needs-input')).toBe(204)
    expect(onSignal).toHaveBeenCalledWith('term-1', 'needs-input')
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
    server = new HookServer({ socketPath, token: TOKEN, onSignal })
    await server.listen()
    expect(await post(socketPath, '/hooks/t/ready')).toBe(204)
  })
})
