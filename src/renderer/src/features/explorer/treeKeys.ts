import type { DirEntry } from '@shared/files'
import { arrowTarget } from '@renderer/lib/arrowNavigation'

/** A row the tree shows right now, in screen order. The one flat list both the keys and the
 * windowed rendering use (decision 062). */
export interface TreeRow {
  readonly path: string
  readonly entry: DirEntry
  readonly isDir: boolean
  readonly isExpanded: boolean
  /** The folder it sits in; '' for the root. */
  readonly parent: string
  /** 0 for the root's entries (`aria-level` is depth + 1). */
  readonly depth: number
  /** 1-based place among its folder's entries, and how many there are: with only a window of
   * rows in the DOM, `aria-posinset` / `aria-setsize` tell screen readers the real numbers. */
  readonly posInSet: number
  readonly setSize: number
}

/** What a key does in the tree: move focus to a row, or open/close a folder. */
export type TreeMove =
  | { readonly kind: 'focus'; readonly path: string }
  | { readonly kind: 'toggle'; readonly path: string }

/** Rows of every loaded folder that is open, depth first, as the tree renders them. */
export function visibleRows(
  entries: Readonly<Record<string, readonly DirEntry[]>>,
  expanded: readonly string[],
): readonly TreeRow[] {
  const open = new Set(expanded)
  const rows: TreeRow[] = []
  const walk = (dir: string, depth: number): void => {
    const level = entries[dir] ?? []
    level.forEach((entry, index) => {
      const isDir = entry.kind === 'dir'
      const isExpanded = isDir && open.has(entry.path)
      rows.push({
        path: entry.path,
        entry,
        isDir,
        isExpanded,
        parent: dir,
        depth,
        posInSet: index + 1,
        setSize: level.length,
      })
      if (isExpanded) walk(entry.path, depth + 1)
    })
  }
  walk('', 0)
  return rows
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
