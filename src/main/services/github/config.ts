/**
 * Client ID of the "Dugout" GitHub OAuth App (Device Flow enabled). OAuth client IDs are public
 * identifiers, not secrets, and the device flow needs no client secret. Forks can use their own
 * app via DUGOUT_GITHUB_CLIENT_ID.
 */
const GITHUB_CLIENT_ID = 'Ov23libOb8Uedg6F3xsu'

export const GITHUB_SCOPES = ['repo', 'read:user', 'workflow'] as const

export interface GitHubConfig {
  readonly clientId: string
  readonly webBaseUrl: string
  readonly apiBaseUrl: string
}

/** DUGOUT_GITHUB_BASE_URL points both web and API at one server (used by e2e stubs). */
export function gitHubConfig(env: Readonly<Record<string, string | undefined>>): GitHubConfig {
  const base = env.DUGOUT_GITHUB_BASE_URL?.replace(/\/$/, '')
  return {
    clientId: env.DUGOUT_GITHUB_CLIENT_ID ?? GITHUB_CLIENT_ID,
    webBaseUrl: base ?? 'https://github.com',
    apiBaseUrl: base ? `${base}/api` : 'https://api.github.com',
  }
}
