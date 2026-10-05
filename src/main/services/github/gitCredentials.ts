export interface GitCredentialConfig {
  /** Global `-c` options, placed before the git subcommand. */
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/**
 * Makes git use the signed-in GitHub token for HTTPS remotes on the GitHub host. The first
 * option clears other credential helpers for that host (a stale Keychain entry must not win);
 * the second answers `get` requests from an env var, so the token never reaches disk or argv.
 */
export function gitCredentialConfig(token: string | null, webBaseUrl: string): GitCredentialConfig {
  if (!token) return { args: [], env: {} }
  const key = `credential.${webBaseUrl}.helper`
  const helper =
    '!f() { test "$1" = get || exit 0; echo username=x-access-token; echo "password=$DUGOUT_GITHUB_TOKEN"; }; f'
  return {
    args: ['-c', `${key}=`, '-c', `${key}=${helper}`],
    env: { DUGOUT_GITHUB_TOKEN: token },
  }
}
