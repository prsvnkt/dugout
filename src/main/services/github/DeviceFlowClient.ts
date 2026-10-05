export interface DeviceCode {
  readonly deviceCode: string
  readonly userCode: string
  readonly verificationUri: string
  readonly intervalSeconds: number
  readonly expiresAt: number
}

export interface DeviceFlowClientDeps {
  readonly fetch: typeof globalThis.fetch
  readonly webBaseUrl: string
  readonly clientId: string
  readonly scopes: readonly string[]
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => number
}

const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code'
const SECOND_MS = 1_000

interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

interface TokenResponse {
  access_token?: string
  error?: string
  interval?: number
}

/** GitHub's OAuth device flow: show a code, the user approves it in the browser, we poll. */
export class DeviceFlowClient {
  constructor(private readonly deps: DeviceFlowClientDeps) {}

  async start(): Promise<DeviceCode> {
    const data = await this.post<DeviceCodeResponse>('/login/device/code', {
      client_id: this.deps.clientId,
      scope: this.deps.scopes.join(' '),
    })
    if (!data.device_code) throw new Error('GitHub did not return a sign-in code.')
    return {
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      intervalSeconds: data.interval,
      expiresAt: this.deps.now() + data.expires_in * SECOND_MS,
    }
  }

  /** Polls until the user approves (resolves the token), denies, the code expires, or abort. */
  async waitForToken(code: DeviceCode, signal?: AbortSignal): Promise<string> {
    let intervalSeconds = code.intervalSeconds
    for (;;) {
      if (signal?.aborted) throw new Error('Sign-in was cancelled.')
      await this.deps.sleep(intervalSeconds * SECOND_MS)
      if (signal?.aborted) throw new Error('Sign-in was cancelled.')

      const data = await this.post<TokenResponse>('/login/oauth/access_token', {
        client_id: this.deps.clientId,
        device_code: code.deviceCode,
        grant_type: GRANT_TYPE,
      })
      if (data.access_token) return data.access_token
      switch (data.error) {
        case 'authorization_pending':
          continue
        case 'slow_down':
          intervalSeconds = data.interval ?? intervalSeconds + 5
          continue
        case 'access_denied':
          throw new Error('Sign-in was cancelled on GitHub.')
        case 'expired_token':
          throw new Error('The sign-in code expired. Please try again.')
        default:
          throw new Error(`GitHub sign-in failed${data.error ? ` (${data.error})` : ''}.`)
      }
    }
  }

  private async post<T>(path: string, body: Record<string, string>): Promise<T> {
    const response = await this.deps.fetch(`${this.deps.webBaseUrl}${path}`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    })
    if (!response.ok) throw new Error(`GitHub sign-in failed (HTTP ${response.status}).`)
    return (await response.json()) as T
  }
}
