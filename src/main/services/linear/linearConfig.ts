export interface LinearConfig {
  /** Linear's GraphQL endpoint. */
  readonly apiUrl: string
  /** Where issue pages live; only links there are opened. */
  readonly webOrigin: string
}

export interface LinearOverrides {
  /** One server for both the API and issue pages (e2e stubs); validated by `readOverrides`. */
  readonly linearBaseUrl?: string
}

export function linearConfig(overrides: LinearOverrides): LinearConfig {
  const base = overrides.linearBaseUrl
  return {
    apiUrl: base ? `${base}/graphql` : 'https://api.linear.app/graphql',
    webOrigin: base ?? 'https://linear.app',
  }
}
