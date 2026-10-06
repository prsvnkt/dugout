import type { DeviceCodePrompt, GitHubAccount, GitHubAuthState } from '@shared/github'
import type { GitHubCredentials, StoredSession } from './credentials'
import { RefreshRejectedError, type DeviceCode } from './DeviceFlowClient'
import { GitHubUnauthorizedError, GitHubUnavailableError } from './GitHubApi'

export interface GitHubAuthDeps {
  readonly isConfigured: boolean
  readonly now: () => number
  readonly deviceFlow: {
    start(): Promise<DeviceCode>
    waitForToken(code: DeviceCode, signal?: AbortSignal): Promise<GitHubCredentials>
    refresh(refreshToken: string): Promise<GitHubCredentials>
  }
  readonly tokens: {
    load(): Promise<StoredSession | null>
    save(session: StoredSession): Promise<void>
    clear(): Promise<void>
  }
  readonly api: { getUser(token: string): Promise<GitHubAccount> }
  readonly onChange: (state: GitHubAuthState) => void
  /** Runs `run` after `delayMs`; returns a cancel function. (setTimeout in the app.) */
  readonly schedule: (run: () => void, delayMs: number) => () => void
}

/** Renew access tokens this long before they expire, so calls never race the expiry. */
const REFRESH_MARGIN_MS = 5 * 60_000
const EXPIRED_MESSAGE = 'Your GitHub sign-in expired. Please sign in again.'
/** Delays between automatic retries while GitHub is unreachable; the last one repeats. */
const RETRY_DELAYS_MS = [15_000, 30_000, 60_000, 120_000, 300_000] as const

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
  /** Shown while offline; saved with the session. */
  private account: GitHubAccount | null = null
  private retryAttempt = 0
  private cancelRetry: (() => void) | null = null
  private renewal: Promise<GitHubCredentials | null> | null = null
  private pending: { controller: AbortController; done: Promise<void> } | null = null

  constructor(private readonly deps: GitHubAuthDeps) {}

  state(): GitHubAuthState {
    return this.current
  }

  async init(): Promise<void> {
    if (!this.deps.isConfigured) return this.setState({ status: 'unconfigured' })
    const session = await this.deps.tokens.load()
    if (!session) return this.setState({ status: 'signed-out' })
    const { account, ...credentials } = session
    this.credentials = credentials
    this.account = account ?? null
    await this.verify()
  }

  /** Re-checks the session now if GitHub was unreachable (e.g. the Mac is back online). */
  async retryNow(): Promise<void> {
    if (this.current.status === 'offline') await this.verify()
  }

  /**
   * An access token valid for at least a few more minutes, renewing it first if needed. Null
   * when signed out (including when the session could not be renewed). Never send it to the
   * renderer.
   */
  async freshToken(): Promise<string | null> {
    if (!this.credentials) return null
    try {
      if (this.isExpiringSoon(this.credentials)) await this.renew()
    } catch (error) {
      if (error instanceof GitHubUnavailableError) this.goOffline()
      throw error
    }
    return this.credentials?.accessToken ?? null
  }

  /** Runs a GitHub call with a fresh token; if GitHub rejects it, renews once and retries. */
  async withToken<T>(call: (token: string) => Promise<T>): Promise<T> {
    const token = await this.freshToken()
    if (!token) throw new Error('Sign in to GitHub first.')
    try {
      const result = await call(token)
      if (this.current.status === 'offline') this.backOnline()
      return result
    } catch (error) {
      if (error instanceof GitHubUnavailableError) this.goOffline()
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
    this.stopRetrying()
    this.credentials = null
    this.account = null
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
      await this.deps.tokens.save(this.sessionFor(renewed))
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
    this.stopRetrying()
    this.credentials = null
    this.account = null
    await this.deps.tokens.clear()
    this.setState({ status: 'signed-out', error: EXPIRED_MESSAGE })
  }

  private async complete(code: DeviceCode, signal: AbortSignal): Promise<void> {
    try {
      const credentials = await this.deps.deviceFlow.waitForToken(code, signal)
      const account = await this.deps.api.getUser(credentials.accessToken)
      this.credentials = credentials
      this.account = account
      await this.deps.tokens.save(this.sessionFor(credentials))
      this.goOnline(account)
    } catch (error) {
      if (signal.aborted) return
      this.setState({ status: 'signed-out', error: message(error) })
    }
  }

  /** Confirms the session with GitHub: online, offline (retrying) or ended. */
  private async verify(): Promise<void> {
    try {
      const token = await this.freshToken()
      if (!token) return
      const account = await this.deps.api.getUser(token)
      if (JSON.stringify(account) !== JSON.stringify(this.account) && this.credentials) {
        this.account = account
        await this.deps.tokens.save(this.sessionFor(this.credentials))
      }
      this.goOnline(account)
    } catch (error) {
      if (error instanceof GitHubUnauthorizedError) return this.endSession()
      if (error instanceof GitHubUnavailableError) return this.goOffline()
      this.setState({ status: 'signed-out', error: message(error) })
    }
  }

  /** A GitHub call just succeeded, so GitHub is reachable again. */
  private backOnline(): void {
    if (this.account) this.goOnline(this.account)
    else void this.verify() // older sessions: fetch the account to show
  }

  private goOnline(account: GitHubAccount): void {
    this.stopRetrying()
    this.setState({ status: 'signed-in', account })
  }

  /** Keeps the session and shows it as offline, retrying with growing delays. */
  private goOffline(): void {
    if (!this.credentials) return
    if (this.current.status !== 'offline')
      this.setState({ status: 'offline', account: this.account })
    this.cancelRetry?.()
    const delay = RETRY_DELAYS_MS[Math.min(this.retryAttempt, RETRY_DELAYS_MS.length - 1)] ?? 0
    this.retryAttempt += 1
    this.cancelRetry = this.deps.schedule(() => void this.retryNow(), delay)
  }

  private stopRetrying(): void {
    this.cancelRetry?.()
    this.cancelRetry = null
    this.retryAttempt = 0
  }

  private sessionFor(credentials: GitHubCredentials): StoredSession {
    return this.account ? { ...credentials, account: this.account } : credentials
  }

  private setState(state: GitHubAuthState): void {
    this.current = state
    this.deps.onChange(state)
  }
}
