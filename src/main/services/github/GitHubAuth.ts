import type { DeviceCodePrompt, GitHubAccount, GitHubAuthState } from '@shared/github'
import type { GitHubCredentials } from './credentials'
import { RefreshRejectedError, type DeviceCode } from './DeviceFlowClient'
import { GitHubUnauthorizedError } from './GitHubApi'

export interface GitHubAuthDeps {
  readonly isConfigured: boolean
  readonly now: () => number
  readonly deviceFlow: {
    start(): Promise<DeviceCode>
    waitForToken(code: DeviceCode, signal?: AbortSignal): Promise<GitHubCredentials>
    refresh(refreshToken: string): Promise<GitHubCredentials>
  }
  readonly tokens: {
    load(): Promise<GitHubCredentials | null>
    save(credentials: GitHubCredentials): Promise<void>
    clear(): Promise<void>
  }
  readonly api: { getUser(token: string): Promise<GitHubAccount> }
  readonly onChange: (state: GitHubAuthState) => void
}

/** Renew access tokens this long before they expire, so calls never race the expiry. */
const REFRESH_MARGIN_MS = 5 * 60_000
const EXPIRED_MESSAGE = 'Your GitHub sign-in expired. Please sign in again.'

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'GitHub sign-in failed.'
}

/**
 * Owns the GitHub session: restore, device-flow sign-in, token renewal and sign-out. Holds the
 * only copy of the credentials; callers get a fresh access token via `freshToken`/`withToken`.
 */
export class GitHubAuth {
  private current: GitHubAuthState = { status: 'signed-out' }
  private credentials: GitHubCredentials | null = null
  private renewal: Promise<GitHubCredentials | null> | null = null
  private pending: { controller: AbortController; done: Promise<void> } | null = null

  constructor(private readonly deps: GitHubAuthDeps) {}

  state(): GitHubAuthState {
    return this.current
  }

  async init(): Promise<void> {
    if (!this.deps.isConfigured) return this.setState({ status: 'unconfigured' })
    this.credentials = await this.deps.tokens.load()
    if (!this.credentials) return this.setState({ status: 'signed-out' })
    try {
      const token = await this.freshToken()
      if (!token) return
      const account = await this.deps.api.getUser(token)
      this.setState({ status: 'signed-in', account })
    } catch (error) {
      if (error instanceof GitHubUnauthorizedError) return this.endSession()
      // Offline or GitHub down: keep the credentials, show signed out until verified.
      this.setState({ status: 'signed-out', error: message(error) })
    }
  }

  /**
   * An access token valid for at least a few more minutes, renewing it first if needed. Null
   * when signed out (including when the session could not be renewed). Never send it to the
   * renderer.
   */
  async freshToken(): Promise<string | null> {
    if (!this.credentials) return null
    if (this.isExpiringSoon(this.credentials)) await this.renew()
    return this.credentials?.accessToken ?? null
  }

  /** Runs a GitHub call with a fresh token; if GitHub rejects it, renews once and retries. */
  async withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.freshToken()
    if (!token) throw new Error('Sign in to GitHub first.')
    try {
      return await call(token)
    } catch (error) {
      if (!(error instanceof GitHubUnauthorizedError)) throw error
      const renewed = this.canRenew(this.credentials) ? await this.renew() : null
      if (!renewed) {
        await this.endSession()
        throw error
      }
      return call(renewed.accessToken)
    }
  }

  async startSignIn(): Promise<DeviceCodePrompt> {
    if (!this.deps.isConfigured) throw new Error('GitHub sign-in is not configured.')
    this.cancelSignIn()
    const code = await this.deps.deviceFlow.start()
    const prompt = {
      userCode: code.userCode,
      verificationUri: code.verificationUri,
      expiresAt: code.expiresAt,
    }
    const controller = new AbortController()
    this.setState({ status: 'pending', prompt })
    const done = this.complete(code, controller.signal)
    this.pending = { controller, done }
    return prompt
  }

  /** Resolves when the current sign-in attempt finishes (success or failure). */
  completion(): Promise<void> {
    return this.pending?.done ?? Promise.resolve()
  }

  cancelSignIn(): void {
    this.pending?.controller.abort()
    this.pending = null
  }

  async signOut(): Promise<void> {
    this.cancelSignIn()
    this.credentials = null
    await this.deps.tokens.clear()
    this.setState({ status: 'signed-out' })
  }

  private isExpiringSoon(credentials: GitHubCredentials): boolean {
    const expiresAt = credentials.accessTokenExpiresAt
    return expiresAt !== null && expiresAt - this.deps.now() < REFRESH_MARGIN_MS
  }

  private canRenew(credentials: GitHubCredentials | null): credentials is GitHubCredentials {
    if (!credentials?.refreshToken) return false
    const expiresAt = credentials.refreshTokenExpiresAt
    return expiresAt === null || expiresAt > this.deps.now()
  }

  /** Renews the access token; concurrent callers share one request. Null if the session ended. */
  private renew(): Promise<GitHubCredentials | null> {
    this.renewal ??= this.renewOnce().finally(() => {
      this.renewal = null
    })
    return this.renewal
  }

  private async renewOnce(): Promise<GitHubCredentials | null> {
    const credentials = this.credentials
    if (!this.canRenew(credentials) || !credentials.refreshToken) {
      await this.endSession()
      return null
    }
    try {
      const renewed = await this.deps.deviceFlow.refresh(credentials.refreshToken)
      await this.deps.tokens.save(renewed)
      this.credentials = renewed
      return renewed
    } catch (error) {
      if (error instanceof RefreshRejectedError) {
        await this.endSession()
        return null
      }
      throw error
    }
  }

  /** The session can no longer be used (expired or revoked): forget it and say why. */
  private async endSession(): Promise<void> {
    this.credentials = null
    await this.deps.tokens.clear()
    this.setState({ status: 'signed-out', error: EXPIRED_MESSAGE })
  }

  private async complete(code: DeviceCode, signal: AbortSignal): Promise<void> {
    try {
      const credentials = await this.deps.deviceFlow.waitForToken(code, signal)
      const account = await this.deps.api.getUser(credentials.accessToken)
      await this.deps.tokens.save(credentials)
      this.credentials = credentials
      this.setState({ status: 'signed-in', account })
    } catch (error) {
      if (signal.aborted) return
      this.setState({ status: 'signed-out', error: message(error) })
    }
  }

  private setState(state: GitHubAuthState): void {
    this.current = state
    this.deps.onChange(state)
  }
}
