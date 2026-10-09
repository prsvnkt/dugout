import type { AgentKind } from './agents'

/**
 * Project context: knowledge agents read through the "dugout" MCP server (list, get, search)
 * and people curate in the Context tab. Shared entries are markdown files in `.dugout/context/`
 * (committed with the repo); private ones stay in app data on this Mac.
 */
export const CONTEXT_KINDS = ['note', 'file', 'link', 'doc', 'codemap'] as const
export type ContextKind = (typeof CONTEXT_KINDS)[number]

export const CONTEXT_SCOPES = ['shared', 'private'] as const
export type ContextScope = (typeof CONTEXT_SCOPES)[number]

/** Where shared entries live, relative to the project's root. */
export const SHARED_CONTEXT_DIR = '.dugout/context'

export const MAX_CONTEXT_TITLE_LENGTH = 200
export const MAX_CONTEXT_BODY_LENGTH = 100_000
/** Agents propose notes, not documents. */
export const MAX_PROPOSED_NOTE_LENGTH = 20_000
export const MAX_CONTEXT_URL_LENGTH = 2048
export const MAX_CONTEXT_SEARCH_LENGTH = 200
/** An entry's id is its file name without `.md`. */
export const CONTEXT_ID_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,99}$/

/** What a kind is called on screen. */
export const CONTEXT_KIND_LABEL: Readonly<Record<ContextKind, string>> = {
  note: 'Note',
  file: 'Pinned file',
  link: 'Link',
  doc: 'Document',
  codemap: 'Codemap',
}

/** What every entry has; `body` is markdown. */
interface EntryBase {
  readonly id: string
  readonly scope: ContextScope
  readonly title: string
  readonly body: string
  readonly updatedAt: string
}

/** The kind-specific fields an entry is created with. */
export type ContextSubject =
  | { readonly kind: 'note' }
  /** A file or folder in the project; `hash` is its content when it was pinned. */
  | { readonly kind: 'file'; readonly path: string; readonly hash: string }
  | { readonly kind: 'link'; readonly url: string }
  /** A document imported from outside the project; `source` is its original file name. */
  | { readonly kind: 'doc'; readonly source: string }
  /** A map of the codebase, written by the user's own agent. */
  | { readonly kind: 'codemap'; readonly agent: AgentKind }

export type ContextEntry = EntryBase & ContextSubject

/**
 * Whether a pinned file still matches its hash: `stale` when it changed since it was pinned,
 * `missing` when it is gone. Only `file` entries have one.
 */
export type PinState = 'current' | 'stale' | 'missing'

export type ContextEntryView = ContextEntry & { readonly pin?: PinState }

/** A note an agent proposed; it is shared only after the user approves it. */
export interface ContextProposal {
  readonly id: string
  readonly title: string
  readonly body: string
  /** The agent that proposed it, when known. */
  readonly proposedBy: AgentKind | null
  readonly createdAt: string
}

/** Everything the Context tab shows for a project. */
export interface ProjectContext {
  readonly entries: readonly ContextEntryView[]
  readonly proposals: readonly ContextProposal[]
}

/** A new entry from the Context tab. Documents are imported and codemaps built instead. */
export type ContextEntryInput = {
  readonly scope: ContextScope
  readonly title: string
  readonly body: string
} & (
  | { readonly kind: 'note' }
  | { readonly kind: 'file'; readonly path: string }
  | { readonly kind: 'link'; readonly url: string }
)

/** An edit from the Context tab: any entry's title and body (its kind and scope stay). */
export interface ContextEntryEdit {
  readonly id: string
  readonly title: string
  readonly body: string
}
