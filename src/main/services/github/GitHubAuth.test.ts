import { describe, expect, test, vi } from 'vitest'
import type { GitHubAuthState } from '@shared/github'
import type { GitHubCredentials, StoredSession } from './credentials'
import { RefreshRejectedError } from './DeviceFlowClient'
import { GitHubAuth, type GitHubAuthDeps } from './GitHubAuth'
import { GitHubUnauthorizedError, GitHubUnavailableError } from './GitHubApi'

const ACCOUNT = { login: 'octo', name: null, avatarUrl: 'https://a/1.png' }
const CODE = {
  deviceCode: 'dev',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  intervalSeconds: 5,
  expiresAt: 900_000,
}
const HOUR = 3_600_000
const NOW = 10 * HOUR

const lasting = (accessToken: string): GitHubCredentials => ({
  accessToken,
  refreshToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
})

const expiring = (
  accessToken: string,
  expiresIn: number,
  refreshToken = 'ghr_1',
): GitHubCredentials => ({
  accessToken,
  refreshToken,
  accessTokenExpiresAt: NOW + expiresIn,
  refreshTokenExpiresAt: NOW + 1_000 * HOUR,
})

function setup(overrides: Partial<GitHubAuthDeps> = {}) {
  let stored: StoredSession | null = null
  const timers: { run: () => void; delayMs: number; isCancelled: boolean }[] = []
  const states: GitHubAuthState[] = []
  const deps: GitHubAuthDeps = {
    isConfigured: true,
    now: () => NOW,
    deviceFlow: {
      start: vi.fn(async () => CODE),
      waitForToken: vi.fn(async () => lasting('gho_new')),
      refresh: vi.fn(async () => expiring('ghu_renewed', 8 * HOUR, 'ghr_2')),
    },
    tokens: {
      load: vi.fn(async () => stored),
      save: vi.fn(async (session: StoredSession) => {
        stored = session
      }),
      clear: vi.fn(async () => {
        stored = null
      }),
    },
    api: { getUser: vi.fn(async () => ACCOUNT) },
    onChange: (state) => states.push(state),
    schedule: (run, delayMs) => {
      const timer = { run, delayMs, isCancelled: false }
      timers.push(timer)
      return () => {
        timer.isCancelled = true
      }
    },
    ...overrides,
  }
  const activeTimers = () => timers.filter((timer) => !timer.isCancelled)
  return { auth: new GitHubAuth(deps), deps, states, stored: () => stored, activeTimers }
}

describe('GitHubAuth sessions', () => {
  test('is unconfigured without an OAuth app client id', async () => {
    const { auth } = setup({ isConfigured: false })
    await auth.init()
    expect(auth.state()).toEqual({ status: 'unconfigured' })
  })

  test('restores a stored session on start', async () => {
    const { auth, deps } = setup()
    await deps.tokens.save(lasting('gho_old'))
    await auth.init()
    expect(auth.state()).toEqual({ status: 'signed-in', account: ACCOUNT })
    expect(await auth.freshToken()).toBe('gho_old')
  })

  test('drops a revoked token on start', async () => {
    const { auth, deps, stored } = setup({
      api: { getUser: vi.fn(async () => Promise.reject(new GitHubUnauthorizedError())) },
    })
    await deps.tokens.save(lasting('gho_revoked'))
    await auth.init()
    expect(auth.state().status).toBe('signed-out')
    expect(stored()).toBeNull()
  })

  test('signs in through the device flow and stores the credentials', async () => {
    const { auth, states, stored } = setup()
    await auth.init()

    const prompt = await auth.startSignIn()
    await auth.completion()

    expect(prompt.userCode).toBe('ABCD-1234')
    expect(states.map((state) => state.status)).toEqual(['signed-out', 'pending', 'signed-in'])
    expect(stored()?.accessToken).toBe('gho_new')
    expect(JSON.stringify(states)).not.toContain('gho_new')
  })

  test('returns to signed out with the reason when sign-in fails', async () => {
    const { auth } = setup({
      deviceFlow: {
        start: vi.fn(async () => CODE),
        waitForToken: vi.fn(async () => Promise.reject(new Error('The code expired.'))),
        refresh: vi.fn(),
      },
    })
    await auth.init()
    await auth.startSignIn()
    await auth.completion()
    expect(auth.state()).toEqual({ status: 'signed-out', error: 'The code expired.' })
  })

  test('signing out forgets the credentials', async () => {
    const { auth, deps, stored } = setup()
    await deps.tokens.save(lasting('gho_old'))
    await auth.init()
    await auth.signOut()
    expect(auth.state()).toEqual({ status: 'signed-out' })
    expect(await auth.freshToken()).toBeNull()
    expect(stored()).toBeNull()
  })
})

describe('GitHubAuth token refresh', () => {
  test('uses the current token while it is not close to expiring', async () => {
    const { auth, deps } = setup()
    await deps.tokens.save(expiring('ghu_current', 2 * HOUR))
    await auth.init()
    expect(await auth.freshToken()).toBe('ghu_current')
    expect(deps.deviceFlow.refresh).not.toHaveBeenCalled()
  })

  test('renews a token about to expire and stores the rotated refresh token', async () => {
    const { auth, deps, stored } = setup()
    await deps.tokens.save(expiring('ghu_old', 60_000))
    await auth.init()

    expect(await auth.freshToken()).toBe('ghu_renewed')
    expect(deps.deviceFlow.refresh).toHaveBeenCalledWith('ghr_1')
    expect(stored()?.refreshToken).toBe('ghr_2')
  })

  test('concurrent callers share one renewal', async () => {
    let now = NOW
    const { auth, deps } = setup({ now: () => now })
    await deps.tokens.save(expiring('ghu_old', 2 * HOUR))
    await auth.init()
    now = NOW + 2 * HOUR // the token is now about to expire

    const tokens = await Promise.all([auth.freshToken(), auth.freshToken(), auth.freshToken()])

    expect(tokens).toEqual(['ghu_renewed', 'ghu_renewed', 'ghu_renewed'])
    expect(deps.deviceFlow.refresh).toHaveBeenCalledTimes(1)
  })

  test('renews an already expired token when the app starts', async () => {
    const { auth, deps } = setup()
    await deps.tokens.save(expiring('ghu_expired', -HOUR))
    await auth.init()
    expect(auth.state()).toEqual({ status: 'signed-in', account: ACCOUNT })
    expect(deps.api.getUser).toHaveBeenCalledWith('ghu_renewed')
  })

  test('signs out with a clear message when the refresh token is rejected', async () => {
    const { auth, deps, stored } = setup()
    vi.mocked(deps.deviceFlow.refresh).mockRejectedValue(new RefreshRejectedError())
    await deps.tokens.save(expiring('ghu_old', 60_000))
    await auth.init()

    expect(auth.state()).toEqual({
      status: 'signed-out',
      error: 'Your GitHub sign-in expired. Please sign in again.',
    })
    expect(stored()).toBeNull()
  })

  test('signs out when the refresh token itself has expired', async () => {
    const { auth, deps } = setup()
    await deps.tokens.save({ ...expiring('ghu_old', -HOUR), refreshTokenExpiresAt: NOW - 1 })
    await auth.init()
    expect(auth.state().status).toBe('signed-out')
    expect(deps.deviceFlow.refresh).not.toHaveBeenCalled()
  })

  test('withToken renews and retries once when GitHub rejects the token', async () => {
    const { auth, deps } = setup()
    await deps.tokens.save(expiring('ghu_current', 2 * HOUR))
    await auth.init()
    const call = vi
      .fn<(token: string) => Promise<string>>()
      .mockRejectedValueOnce(new GitHubUnauthorizedError())
      .mockResolvedValueOnce('ok')

    await expect(auth.withToken(call)).resolves.toBe('ok')
    expect(call.mock.calls.map(([token]) => token)).toEqual(['ghu_current', 'ghu_renewed'])
  })
})

describe('GitHubAuth offline', () => {
  const ACCOUNT_SAVED = { ...lasting('gho_saved'), account: ACCOUNT }
  const unavailable = () => Promise.reject(new GitHubUnavailableError())

  test('remembers the account when signing in', async () => {
    const { auth, stored } = setup()
    await auth.init()
    await auth.startSignIn()
    await auth.completion()
    expect(stored()?.account).toEqual(ACCOUNT)
  })

  test('stays signed in (offline) when GitHub cannot be reached at start, and retries', async () => {
    const { auth, deps, stored, activeTimers } = setup({ api: { getUser: vi.fn(unavailable) } })
    await deps.tokens.save(ACCOUNT_SAVED)

    await auth.init()

    expect(auth.state()).toEqual({ status: 'offline', account: ACCOUNT })
    expect(stored()).not.toBeNull()
    expect(activeTimers()).toHaveLength(1)
  })

  test('backs off between retries, then recovers when GitHub is back', async () => {
    const getUser = vi.fn<(token: string) => Promise<typeof ACCOUNT>>(unavailable)
    const { auth, deps, activeTimers } = setup({ api: { getUser } })
    await deps.tokens.save(ACCOUNT_SAVED)
    await auth.init()

    const first = activeTimers()[0]
    first?.run()
    await vi.waitFor(() => expect(activeTimers()[0]).not.toBe(first))
    const second = activeTimers()[0]
    expect(second?.delayMs).toBeGreaterThan(first?.delayMs ?? 0)

    getUser.mockResolvedValue(ACCOUNT)
    second?.run()
    await vi.waitFor(() => expect(auth.state()).toEqual({ status: 'signed-in', account: ACCOUNT }))
    expect(activeTimers()).toHaveLength(0)
  })

  test('retries immediately when asked (e.g. the Mac is back online)', async () => {
    const getUser = vi.fn<(token: string) => Promise<typeof ACCOUNT>>(unavailable)
    const { auth, deps } = setup({ api: { getUser } })
    await deps.tokens.save(ACCOUNT_SAVED)
    await auth.init()

    getUser.mockResolvedValue(ACCOUNT)
    await auth.retryNow()

    expect(auth.state()).toEqual({ status: 'signed-in', account: ACCOUNT })
  })

  test('sessions saved before account details were kept still show as offline', async () => {
    const { auth, deps } = setup({ api: { getUser: vi.fn(unavailable) } })
    await deps.tokens.save(lasting('gho_legacy'))
    await auth.init()
    expect(auth.state()).toEqual({ status: 'offline', account: null })
  })

  test('a renewal that cannot reach GitHub goes offline instead of signing out', async () => {
    const { auth, deps, stored } = setup()
    vi.mocked(deps.deviceFlow.refresh).mockImplementation(unavailable)
    await deps.tokens.save({ ...expiring('ghu_old', 60_000), account: ACCOUNT })

    await auth.init()

    expect(auth.state()).toEqual({ status: 'offline', account: ACCOUNT })
    expect(stored()).not.toBeNull()
  })

  test('a successful GitHub call while offline brings it back online', async () => {
    const getUser = vi.fn<(token: string) => Promise<typeof ACCOUNT>>(unavailable)
    const { auth, deps, activeTimers } = setup({ api: { getUser } })
    await deps.tokens.save(ACCOUNT_SAVED)
    await auth.init()

    await auth.withToken(async () => 'ok')

    expect(auth.state()).toEqual({ status: 'signed-in', account: ACCOUNT })
    expect(activeTimers()).toHaveLength(0)
  })

  test('signing out stops retrying', async () => {
    const { auth, deps, activeTimers } = setup({ api: { getUser: vi.fn(unavailable) } })
    await deps.tokens.save(ACCOUNT_SAVED)
    await auth.init()
    await auth.signOut()
    expect(activeTimers()).toHaveLength(0)
  })
})
