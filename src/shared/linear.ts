/** The Linear user an API key belongs to. The key itself never leaves main (decision 051). */
export interface LinearAccount {
  /** The user's display name. */
  readonly name: string
  /** The Linear workspace (organisation) the key belongs to; one per app. */
  readonly organization: string
}

/** Whether Dugout has a working Linear API key, as the renderer sees it. */
export type LinearState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'connected'; readonly account: LinearAccount }

/** A team a project can take its tasks from (`TaskSource` with `kind: 'linear'`). */
export interface LinearTeam {
  /** The identifier prefix, e.g. "ENG" in ENG-123. */
  readonly key: string
  readonly name: string
}

/** Personal API keys are short; the limit only guards against pasting something else. */
export const MAX_LINEAR_API_KEY_LENGTH = 200
