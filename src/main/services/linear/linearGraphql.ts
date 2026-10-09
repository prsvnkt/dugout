export interface LinearApiDeps {
  readonly fetch: typeof globalThis.fetch
  /** https://api.linear.app/graphql, or a local stub in e2e tests. */
  readonly apiUrl: string
}

/** Linear rejected the API key (revoked, or never valid). */
export class LinearUnauthorizedError extends Error {
  override readonly name = 'LinearUnauthorizedError'
  constructor() {
    super('Linear did not accept the API key. Connect Linear again with a new key.')
  }
}

const UNAUTHORIZED = 401
const SERVER_ERROR = 500
const AUTH_ERROR_CODES = new Set(['AUTHENTICATION_ERROR', 'UNAUTHENTICATED'])

interface GraphqlError {
  readonly message?: string
  readonly extensions?: { readonly code?: string; readonly userPresentableMessage?: string }
}

interface GraphqlResponse<T> {
  readonly data?: T | null
  readonly errors?: readonly GraphqlError[]
}

export const LINEAR_UNAVAILABLE = 'Can’t reach Linear right now.'
const RATE_LIMITED = 'RATELIMITED'

function errorMessage(error: GraphqlError): string {
  if (error.extensions?.code === RATE_LIMITED) {
    return 'Linear’s API limit was reached. Try again in a few minutes.'
  }
  return error.extensions?.userPresentableMessage ?? error.message ?? 'Linear returned an error.'
}

/**
 * One request to Linear's GraphQL API with a personal API key, which Linear expects as the bare
 * `Authorization` header (no "Bearer"). Errors become readable messages; the key never appears
 * in them.
 */
export async function linearGraphql<T>(
  deps: LinearApiDeps,
  apiKey: string,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const response = await deps
    .fetch(deps.apiUrl, {
      method: 'POST',
      headers: { authorization: apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    })
    .catch(() => {
      throw new Error(LINEAR_UNAVAILABLE)
    })
  if (response.status === UNAUTHORIZED) throw new LinearUnauthorizedError()
  if (response.status >= SERVER_ERROR) throw new Error(LINEAR_UNAVAILABLE)
  const body = (await response.json().catch(() => ({}))) as GraphqlResponse<T>
  const [first] = body.errors ?? []
  if (first) {
    if (first.extensions?.code && AUTH_ERROR_CODES.has(first.extensions.code)) {
      throw new LinearUnauthorizedError()
    }
    throw new Error(errorMessage(first))
  }
  if (!response.ok || !body.data) throw new Error(`Linear returned HTTP ${response.status}.`)
  return body.data
}
