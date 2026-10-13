import type { DirEntry } from '@shared/files'
import { arrowTarget } from '@renderer/lib/arrowNavigation'

/** A row the tree shows right now, in screen order. */
export interface TreeRow {
  readonly path: string
  readonly isDir: boolean
  readonly isExpanded: boolean
  /** The folder it sits in; '' for the root. */
  readonly parent: string
}

/** What a key does in the tree: move focus to a row, or open/close a folder. */
export type TreeMove =
  | { readonly kind: 'focus'; readonly path: string }
  | { readonly kind: 'toggle'; readonly path: string }

/** Rows of every loaded folder that is open, depth first, as the tree renders them. */
export function visibleRows(
  entries: Readonly<Record<string, readonly DirEntry[]>>,
  expanded: readonly string[],
  dir = '',
): readonly TreeRow[] {
  return (entries[dir] ?? []).flatMap((entry) => {
    const isDir = entry.kind === 'dir'
    const isExpanded = isDir && expanded.includes(entry.path)
    const row: TreeRow = { path: entry.path, isDir, isExpanded, parent: dir }
    return isExpanded ? [row, ...visibleRows(entries, expanded, entry.path)] : [row]
  })
}

/**
 * The row that takes Tab (roving tabindex): the first candidate still shown, else the first
 * row. Null only when the tree is empty.
 */
export function tabStopPath(
  rows: readonly TreeRow[],
  candidates: readonly (string | null)[],
): string | null {
  const shown = candidates.find((path) => path !== null && rows.some((row) => row.path === path))
  return shown ?? rows[0]?.path ?? null
}

/** Right opens a folder, then enters it; Left closes it, then goes to its parent. */
function horizontalMove(row: TreeRow, next: TreeRow | undefined, key: string): TreeMove | null {
  if (key === 'ArrowRight') {
    if (!row.isDir) return null
    if (!row.isExpanded) return { kind: 'toggle', path: row.path }
    return next?.parent === row.path ? { kind: 'focus', path: next.path } : null
  }
  if (row.isExpanded) return { kind: 'toggle', path: row.path }
  return row.parent === '' ? null : { kind: 'focus', path: row.parent }
}

/** APG tree view keys: Up/Down/Home/End move (no wrap), Right/Left open, enter and close. */
export function treeKeyMove(
  rows: readonly TreeRow[],
  focusedPath: string | null,
  key: string,
): TreeMove | null {
  const current = rows.findIndex((row) => row.path === focusedPath)
  const row = rows[current]
  if (row && (key === 'ArrowRight' || key === 'ArrowLeft')) {
    return horizontalMove(row, rows[current + 1], key)
  }
  const target = arrowTarget(key, current, rows.length, { orientation: 'vertical', wrap: false })
  const targetRow = target === null ? undefined : rows[target]
  return targetRow ? { kind: 'focus', path: targetRow.path } : null
}
