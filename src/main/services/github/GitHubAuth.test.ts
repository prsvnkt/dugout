import { describe, expect, test, vi } from 'vitest'
import type { GitHubAuthState } from '@shared/github'
import { GitHubAuth, type GitHubAuthDeps } from './GitHubAuth'
import { GitHubUnauthorizedError } from './GitHubApi'

const ACCOUNT = { login: 'octo', name: null, avatarUrl: 'https://a/1.png' }
const CODE = {
  deviceCode: 'dev',
  userCode: 'ABCD-1234',
  verificationUri: 'https://github.com/login/device',
  intervalSeconds: 5,
  expiresAt: 900_000,
}

function setup(overrides: Partial<GitHubAuthDeps> = {}) {
  let stored: string | null = null
  const states: GitHubAuthState[] = []
  const deps: GitHubAuthDeps = {
    isConfigured: true,
    deviceFlow: { start: vi.fn(async () => CODE), waitForToken: vi.fn(async () => 'gho_new') },
    tokens: {
      load: vi.fn(async () => stored),
      save: vi.fn(async (token: string) => {
        stored = token
      }),
      clear: vi.fn(async () => {
        stored = null
      }),
    },
    api: { getUser: vi.fn(async () => ACCOUNT) },
    onChange: (state) => states.push(state),
    ...overrides,
  }
  return { auth: new GitHubAuth(deps), deps, states, stored: () => stored }
}

describe('GitHubAuth', () => {
  test('is unconfigured without an OAuth app client id', async () => {
    const { auth } = setup({ isConfigured: false })
    await auth.init()
    expect(auth.state()).toEqual({ status: 'unconfigured' })
  })

  test('restores a stored session on start', async () => {
    const { auth, deps } = setup()
    await deps.tokens.save('gho_old')
    await auth.init()
    expect(auth.state()).toEqual({ status: 'signed-in', account: ACCOUNT })
    expect(auth.token()).toBe('gho_old')
  })

  test('drops a revoked token on start', async () => {
    const { auth, deps, stored } = setup({
      api: { getUser: vi.fn(async () => Promise.reject(new GitHubUnauthorizedError())) },
    })
    await deps.tokens.save('gho_revoked')
    await auth.init()
    expect(auth.state().status).toBe('signed-out')
    expect(stored()).toBeNull()
  })

  test('signs in through the device flow and stores the token', async () => {
    const { auth, states, stored } = setup()
    await auth.init()

    const prompt = await auth.startSignIn()
    await auth.completion()

    expect(prompt).toEqual({
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      expiresAt: 900_000,
    })
    expect(states.map((state) => state.status)).toEqual(['signed-out', 'pending', 'signed-in'])
    expect(stored()).toBe('gho_new')
    expect(JSON.stringify(states)).not.toContain('gho_new')
  })

  test('returns to signed out with the reason when sign-in fails', async () => {
    const { auth } = setup({
      deviceFlow: {
        start: vi.fn(async () => CODE),
        waitForToken: vi.fn(async () => Promise.reject(new Error('The code expired.'))),
      },
    })
    await auth.init()
    await auth.startSignIn()
    await auth.completion()
    expect(auth.state()).toEqual({ status: 'signed-out', error: 'The code expired.' })
  })

  test('signing out forgets the token', async () => {
    const { auth, deps, stored } = setup()
    await deps.tokens.save('gho_old')
    await auth.init()
    await auth.signOut()
    expect(auth.state()).toEqual({ status: 'signed-out' })
    expect(auth.token()).toBeNull()
    expect(stored()).toBeNull()
  })
})
