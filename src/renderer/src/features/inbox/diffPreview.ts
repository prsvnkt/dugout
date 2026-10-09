import type { TextChange } from '@shared/toolCall'

export interface DiffLine {
  readonly type: 'context' | 'removed' | 'added' | 'more'
  readonly text: string
}

/** Unchanged lines shown on each side of a change. */
const CONTEXT_LINES = 2
/** A preview, not a review: longer changes are cut here. */
export const MAX_DIFF_LINES = 40

function splitLines(text: string): string[] {
  return text === '' ? [] : text.split('\n')
}

function commonPrefix(a: readonly string[], b: readonly string[]): number {
  let count = 0
  while (count < a.length && count < b.length && a[count] === b[count]) count++
  return count
}

function commonSuffix(a: readonly string[], b: readonly string[], prefix: number): number {
  let count = 0
  while (
    count < a.length - prefix &&
    count < b.length - prefix &&
    a[a.length - 1 - count] === b[b.length - 1 - count]
  )
    count++
  return count
}

const asLines = (type: DiffLine['type'], texts: readonly string[]): DiffLine[] =>
  texts.map((text) => ({ type, text }))

/**
 * A small unified-diff view of one replacement: the lines that differ, removed then added, with
 * a little unchanged context on each side.
 */
export function diffPreview(change: TextChange): DiffLine[] {
  const before = splitLines(change.before)
  const after = splitLines(change.after)
  const prefix = commonPrefix(before, after)
  const suffix = commonSuffix(before, after, prefix)
  const lines = [
    ...asLines('context', before.slice(Math.max(0, prefix - CONTEXT_LINES), prefix)),
    ...asLines('removed', before.slice(prefix, before.length - suffix)),
    ...asLines('added', after.slice(prefix, after.length - suffix)),
    ...asLines('context', before.slice(before.length - suffix).slice(0, CONTEXT_LINES)),
  ]
  if (lines.length <= MAX_DIFF_LINES) return lines
  const hidden = lines.length - MAX_DIFF_LINES
  return [...lines.slice(0, MAX_DIFF_LINES), { type: 'more', text: `${hidden} more lines` }]
}
