/**
 * Client ID of the "Dugout" GitHub OAuth App (Device Flow enabled). OAuth client IDs are public
 * identifiers, not secrets, and the device flow needs no client secret. Forks change this
 * constant to use their own app (DUGOUT_GITHUB_CLIENT_ID only works in dev and e2e runs).
 */
const GITHUB_CLIENT_ID = 'Ov23libOb8Uedg6F3xsu'

export const GITHUB_SCOPES = ['repo', 'read:user', 'workflow'] as const

export interface GitHubConfig {
  readonly clientId: string
  readonly webBaseUrl: string
  readonly apiBaseUrl: string
}

export interface GitHubOverrides {
  /** One server for both web and API (e2e stubs); already validated by `readOverrides`. */
  readonly githubBaseUrl?: string
  readonly githubClientId?: string
}

export function gitHubConfig(overrides: GitHubOverrides): GitHubConfig {
  const base = overrides.githubBaseUrl
  return {
    clientId: overrides.githubClientId ?? GITHUB_CLIENT_ID,
    webBaseUrl: base ?? 'https://github.com',
    apiBaseUrl: base ? `${base}/api` : 'https://api.github.com',
  }
}
