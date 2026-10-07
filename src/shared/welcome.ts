import type { AgentKind } from './terminal'

/** A git repository found on this Mac, offered on the welcome screen. */
export interface LocalRepo {
  readonly name: string
  readonly path: string
  /** When its `.git` last changed (ms since epoch): a proxy for "recently worked on". */
  readonly modifiedAt: number
}

/**
 * Where to look. `common` covers the usual code folders and needs no permission. `documents`
 * (Documents, Desktop) makes macOS ask for access, so it runs only when the user asks.
 */
export const REPO_SEARCH_SCOPES = ['common', 'documents'] as const
export type RepoSearchScope = (typeof REPO_SEARCH_SCOPES)[number]

/** Whether an agent CLI is on the PATH of the user's login shell. */
export type AgentCliStatus =
  | { readonly state: 'installed'; readonly path: string }
  | { readonly state: 'missing' }
  /** The check failed or timed out (e.g. a slow shell profile). */
  | { readonly state: 'unknown' }

export type AgentCliCheck = Readonly<Record<AgentKind, AgentCliStatus>>
