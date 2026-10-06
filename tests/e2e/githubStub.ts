import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const STUB_TOKEN = 'gho_stub_secret_token'
export const STUB_USER_CODE = 'WXYZ-1234'
const AVATAR = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

export interface StubRepo {
  readonly name: string
  readonly cloneUrl: string
}

export interface StubOptions {
  /** Issue 1-second access tokens with rotating refresh tokens ("Expire user access tokens"). */
  readonly expiringTokens?: boolean
}

/** A tiny stand-in for github.com + api.github.com: device flow, refresh, /user, /user/repos. */
export async function startGitHubStub(repos: readonly StubRepo[] = [], options: StubOptions = {}) {
  let polls = 0
  let generation = 1
  let isRefreshRevoked = false
  let refreshes = 0
  let isUnavailable = false
  const accessToken = () => (options.expiringTokens ? `ghu_stub_${generation}` : STUB_TOKEN)
  const tokenResponse = () =>
    options.expiringTokens
      ? {
          access_token: accessToken(),
          expires_in: 1,
          refresh_token: `ghr_stub_${generation}`,
          refresh_token_expires_in: 3_600,
        }
      : { access_token: STUB_TOKEN }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub')
    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'content-type': 'application/json' })
      res.end(JSON.stringify(body))
    }
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      if (isUnavailable) return json({ message: 'Service unavailable' }, 503)
      const origin = `http://${req.headers.host}`
      const form = new URLSearchParams(body)
      if (url.pathname === '/login/device/code') {
        return json({
          device_code: 'stub-device',
          user_code: STUB_USER_CODE,
          verification_uri: `${origin}/login/device`,
          expires_in: 900,
          interval: 1,
        })
      }
      if (
        url.pathname === '/login/oauth/access_token' &&
        form.get('grant_type') === 'refresh_token'
      ) {
        // Refresh tokens rotate: only the latest one works, once.
        if (isRefreshRevoked || form.get('refresh_token') !== `ghr_stub_${generation}`) {
          return json({ error: 'bad_refresh_token' })
        }
        refreshes += 1
        generation += 1
        return json(tokenResponse())
      }
      if (url.pathname === '/login/oauth/access_token') {
        polls += 1
        return json(polls < 2 ? { error: 'authorization_pending' } : tokenResponse())
      }
      const authorized = req.headers.authorization === `Bearer ${accessToken()}`
      if (url.pathname.startsWith('/api/') && !authorized)
        return json({ message: 'Bad credentials' }, 401)
      if (url.pathname === '/api/user') {
        return json({ login: 'octocat', name: 'The Octocat', avatar_url: AVATAR })
      }
      if (url.pathname === '/api/user/repos') {
        return json(
          repos.map((repo) => ({
            name: repo.name,
            full_name: `octocat/${repo.name}`,
            owner: { login: 'octocat' },
            description: `The ${repo.name} repo`,
            private: false,
            clone_url: repo.cloneUrl,
            pushed_at: '2026-10-01T00:00:00Z',
          })),
        )
      }
      json({ message: 'Not found' }, 404)
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    refreshCount: () => refreshes,
    /** Simulates GitHub being down (every request answers 503). */
    setUnavailable: (unavailable: boolean) => {
      isUnavailable = unavailable
    },
    revokeRefreshToken: () => {
      isRefreshRevoked = true
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

export function gitHubTestEnv(baseUrl: string): Record<string, string> {
  return {
    DUGOUT_GITHUB_BASE_URL: baseUrl,
    DUGOUT_GITHUB_CLIENT_ID: 'stub-client',
    DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS: '1',
  }
}
