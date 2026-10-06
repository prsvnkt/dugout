export interface GitHubAccount {
  readonly login: string
  readonly name: string | null
  readonly avatarUrl: string
}

/** What the user needs to approve a sign-in in their browser (GitHub device flow). */
export interface DeviceCodePrompt {
  readonly userCode: string
  readonly verificationUri: string
  readonly expiresAt: number
}

/** Auth state shared with the renderer. It never contains the token. */
export type GitHubAuthState =
  | { readonly status: 'unconfigured' }
  | { readonly status: 'signed-out'; readonly error?: string }
  | { readonly status: 'pending'; readonly prompt: DeviceCodePrompt }
  | { readonly status: 'signed-in'; readonly account: GitHubAccount }
  /**
   * Still signed in, but GitHub cannot be reached right now (offline or GitHub down). Retries
   * automatically. `account` is null only for sessions saved before account details were kept.
   */
  | { readonly status: 'offline'; readonly account: GitHubAccount | null }

export interface GitHubRepo {
  readonly fullName: string
  readonly name: string
  readonly owner: string
  readonly description: string | null
  readonly isPrivate: boolean
  readonly cloneUrl: string
  readonly pushedAt: string | null
}
