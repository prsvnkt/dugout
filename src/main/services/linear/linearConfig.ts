export interface LinearConfig {
  /** Linear's GraphQL endpoint. */
  readonly apiUrl: string
  /** Where issue pages live; only links there are opened. */
  readonly webOrigin: string
}

/** DUGOUT_LINEAR_BASE_URL points both the API and issue pages at one server (e2e stubs). */
export function linearConfig(env: Readonly<Record<string, string | undefined>>): LinearConfig {
  const base = env.DUGOUT_LINEAR_BASE_URL?.replace(/\/$/, '')
  return {
    apiUrl: base ? `${base}/graphql` : 'https://api.linear.app/graphql',
    webOrigin: base ?? 'https://linear.app',
  }
}
