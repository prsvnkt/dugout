import type { ContextEntryView, ContextKind, ContextScope, PinState } from '@shared/context'

/** One line of the index agents get from `list_context`: enough to choose what to read. */
export interface ContextIndexItem {
  readonly id: string
  readonly kind: ContextKind
  readonly title: string
  readonly scope: ContextScope
  readonly path?: string
  readonly url?: string
  /** Pinned files only, when they changed or vanished since they were pinned. */
  readonly pin?: Exclude<PinState, 'current'>
}

export interface ContextSearchHit extends ContextIndexItem {
  /** Text around the first match in the body, when the body matched. */
  readonly snippet?: string
}

export const MAX_SEARCH_HITS = 20
const SNIPPET_RADIUS = 80

export function indexItem(entry: ContextEntryView): ContextIndexItem {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    scope: entry.scope,
    ...(entry.kind === 'file' && { path: entry.path }),
    ...(entry.kind === 'link' && { url: entry.url }),
    ...(entry.pin && entry.pin !== 'current' && { pin: entry.pin }),
  }
}

function searchableText(entry: ContextEntryView): string {
  const where = entry.kind === 'file' ? entry.path : entry.kind === 'link' ? entry.url : ''
  return `${entry.title}\n${where}\n${entry.body}`.toLowerCase()
}

function snippet(body: string, word: string): string | undefined {
  const at = body.toLowerCase().indexOf(word)
  if (at === -1) return undefined
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(body.length, at + word.length + SNIPPET_RADIUS)
  const text = body.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${text}${end < body.length ? '…' : ''}`
}

/** Entries whose title, path, link or body contain every word of `query` (any case). */
export function searchContext(
  entries: readonly ContextEntryView[],
  query: string,
): ContextSearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return entries
    .filter((entry) => {
      const text = searchableText(entry)
      return words.every((word) => text.includes(word))
    })
    .slice(0, MAX_SEARCH_HITS)
    .map((entry) => {
      const found = words.map((word) => snippet(entry.body, word)).find(Boolean)
      return { ...indexItem(entry), ...(found && { snippet: found }) }
    })
}
