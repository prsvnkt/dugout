import { describe, expect, test, vi } from 'vitest'
import { DeviceFlowClient, RefreshRejectedError } from './DeviceFlowClient'
import { GitHubUnavailableError } from './GitHubApi'
import { fakeFetch } from './fakeFetch'

const CODE = {
  device_code: 'dev-123',
  user_code: 'ABCD-1234',
  verification_uri: 'https://github.com/login/device',
  expires_in: 900,
  interval: 5,
}

function client(routes: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(routes)
  const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {})
  const device = new DeviceFlowClient({
    fetch: fake.fetch,
    webBaseUrl: 'https://github.com',
    clientId: 'client-1',
    scopes: ['repo', 'read:user'],
    sleep,
    now: () => 0,
  })
  return { device, sleep, requests: fake.requests }
}

describe('DeviceFlowClient', () => {
  test('requests a device code for the app and scopes', async () => {
    const { device, requests } = client({ 'POST /login/device/code': [{ json: CODE }] })

    const code = await device.start()

    expect(code).toEqual({
      deviceCode: 'dev-123',
      userCode: 'ABCD-1234',
      verificationUri: 'https://github.com/login/device',
      intervalSeconds: 5,
      expiresAt: 900_000,
    })
    expect(requests[0]?.headers.accept).toBe('application/json')
    expect(new URLSearchParams(requests[0]?.body).get('scope')).toBe('repo read:user')
    expect(new URLSearchParams(requests[0]?.body).get('client_id')).toBe('client-1')
  })

  test('polls until approved, slowing down when asked', async () => {
    const { device, sleep } = client({
      'POST /login/device/code': [{ json: CODE }],
      'POST /login/oauth/access_token': [
        { json: { error: 'authorization_pending' } },
        { json: { error: 'slow_down', interval: 10 } },
        { json: { access_token: 'gho_token', token_type: 'bearer' } },
      ],
    })
    const code = await device.start()

    await expect(device.waitForToken(code)).resolves.toEqual({
      accessToken: 'gho_token',
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    })
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([5_000, 5_000, 10_000])
  })

  test('reports a denied sign-in', async () => {
    const { device } = client({
      'POST /login/device/code': [{ json: CODE }],
      'POST /login/oauth/access_token': [{ json: { error: 'access_denied' } }],
    })
    await expect(device.waitForToken(await device.start())).rejects.toThrow('cancelled')
  })

  test('reports an expired code', async () => {
    const { device } = client({
      'POST /login/device/code': [{ json: CODE }],
      'POST /login/oauth/access_token': [{ json: { error: 'expired_token' } }],
    })
    await expect(device.waitForToken(await device.start())).rejects.toThrow('expired')
  })

  test('stops polling when aborted', async () => {
    const { device } = client({
      'POST /login/device/code': [{ json: CODE }],
      'POST /login/oauth/access_token': [{ json: { error: 'authorization_pending' } }],
    })
    const code = await device.start()
    const controller = new AbortController()
    controller.abort()
    await expect(device.waitForToken(code, controller.signal)).rejects.toThrow('cancelled')
  })
})

describe('DeviceFlowClient expiring tokens', () => {
  const EXPIRING = {
    access_token: 'ghu_access',
    expires_in: 28_800,
    refresh_token: 'ghr_refresh',
    refresh_token_expires_in: 15_897_600,
  }

  test('returns expiry times when the app issues expiring tokens', async () => {
    const { device } = client({
      'POST /login/device/code': [{ json: CODE }],
      'POST /login/oauth/access_token': [{ json: EXPIRING }],
    })
    expect(await device.waitForToken(await device.start())).toEqual({
      accessToken: 'ghu_access',
      refreshToken: 'ghr_refresh',
      accessTokenExpiresAt: 28_800_000,
      refreshTokenExpiresAt: 15_897_600_000,
    })
  })

  test('refreshes with the refresh token and no client secret', async () => {
    const { device, requests } = client({
      'POST /login/oauth/access_token': [
        { json: { ...EXPIRING, access_token: 'ghu_new', refresh_token: 'ghr_new' } },
      ],
    })

    const renewed = await device.refresh('ghr_refresh')

    expect(renewed).toMatchObject({ accessToken: 'ghu_new', refreshToken: 'ghr_new' })
    const body = new URLSearchParams(requests[0]?.body)
    expect(body.get('grant_type')).toBe('refresh_token')
    expect(body.get('refresh_token')).toBe('ghr_refresh')
    expect(body.get('client_id')).toBe('client-1')
    expect(body.has('client_secret')).toBe(false)
  })

  test('reports a rejected refresh token distinctly', async () => {
    const { device } = client({
      'POST /login/oauth/access_token': [{ json: { error: 'bad_refresh_token' } }],
    })
    await expect(device.refresh('ghr_old')).rejects.toBeInstanceOf(RefreshRejectedError)
  })
})

describe('DeviceFlowClient availability', () => {
  test('a refresh that cannot reach GitHub is reported as unavailable, not rejected', async () => {
    const device = new DeviceFlowClient({
      fetch: async () => Promise.reject(new TypeError('fetch failed')),
      webBaseUrl: 'https://github.com',
      clientId: 'client-1',
      scopes: [],
      sleep: async () => {},
      now: () => 0,
    })
    await expect(device.refresh('ghr_x')).rejects.toBeInstanceOf(GitHubUnavailableError)
  })
})
