/** The Linear user an API key belongs to. The key itself never leaves main (decision 051). */
export interface LinearAccount {
  readonly name: string
  readonly organization: string
}

export type LinearState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'connected'; readonly account: LinearAccount }

export interface LinearTeam {
  readonly key: string
  readonly name: string
}

/** Personal API keys are short; the limit only guards against pasting something else. */
export const MAX_LINEAR_API_KEY_LENGTH = 200
