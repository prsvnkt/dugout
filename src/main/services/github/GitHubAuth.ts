import type { DeviceCodePrompt, GitHubAccount, GitHubAuthState } from '@shared/github'
import type { DeviceCode } from './DeviceFlowClient'
import { GitHubUnauthorizedError } from './GitHubApi'

export interface GitHubAuthDeps {
  readonly isConfigured: boolean
  readonly deviceFlow: {
    start(): Promise<DeviceCode>
    waitForToken(code: DeviceCode, signal?: AbortSignal): Promise<string>
  }
  readonly tokens: {
    load(): Promise<string | null>
    save(token: string): Promise<void>
    clear(): Promise<void>
  }
  readonly api: { getUser(token: string): Promise<GitHubAccount> }
  readonly onChange: (state: GitHubAuthState) => void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'GitHub sign-in failed.'
}

/** Owns the GitHub session: restore, device-flow sign-in, sign-out. Holds the only token copy. */
export class GitHubAuth {
  private current: GitHubAuthState = { status: 'signed-out' }
  private accessToken: string | null = null
  private pending: { controller: AbortController; done: Promise<void> } | null = null

  constructor(private readonly deps: GitHubAuthDeps) {}

  state(): GitHubAuthState {
    return this.current
  }

  /** The token for git and API calls in main. Never send it to the renderer. */
  token(): string | null {
    return this.accessToken
  }

  async init(): Promise<void> {
    if (!this.deps.isConfigured) return this.setState({ status: 'unconfigured' })
    const token = await this.deps.tokens.load()
    if (!token) return this.setState({ status: 'signed-out' })
    try {
      const account = await this.deps.api.getUser(token)
      this.accessToken = token
      this.setState({ status: 'signed-in', account })
    } catch (error) {
      if (error instanceof GitHubUnauthorizedError) await this.deps.tokens.clear()
      // Offline or GitHub down: keep the token but show signed out until it can be verified.
      if (!(error instanceof GitHubUnauthorizedError)) this.accessToken = token
      this.setState({
        status: 'signed-out',
        ...(error instanceof GitHubUnauthorizedError ? {} : { error: message(error) }),
      })
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
    this.accessToken = null
    await this.deps.tokens.clear()
    this.setState({ status: 'signed-out' })
  }

  private async complete(code: DeviceCode, signal: AbortSignal): Promise<void> {
    try {
      const token = await this.deps.deviceFlow.waitForToken(code, signal)
      const account = await this.deps.api.getUser(token)
      await this.deps.tokens.save(token)
      this.accessToken = token
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
