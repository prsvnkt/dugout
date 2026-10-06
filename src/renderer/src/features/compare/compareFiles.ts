import type { WorktreeChanges } from '@shared/compare'

export interface ComparedFile {
  readonly path: string
  /** Which sides changed this file (indexes into the compared worktrees). */
  readonly changedIn: readonly number[]
}

/** Every file changed in any worktree, sorted, with which sides touched it. */
export function compareFiles(sides: readonly WorktreeChanges[]): ComparedFile[] {
  const byPath = new Map<string, number[]>()
  sides.forEach((side, index) => {
    for (const change of side.changes)
      byPath.set(change.path, [...(byPath.get(change.path) ?? []), index])
  })
  return [...byPath]
    .map(([path, changedIn]) => ({ path, changedIn }))
    .sort((a, b) => a.path.localeCompare(b.path))
}
