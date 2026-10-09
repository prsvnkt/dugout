/** One live worktree and the files it changed since its branch left the base branch. */
export interface TrackedWorktree {
  readonly worktreePath: string
  readonly files: readonly string[]
  /** The task its agents work on. Worktrees on the same task are alternatives, not rivals. */
  readonly taskNumber?: number | undefined
}

/** Files one worktree changed that another worktree changed too. */
export interface Overlap {
  /** The other worktree. */
  readonly worktreePath: string
  /** Sorted. */
  readonly files: readonly string[]
}

/** Overlaps named for the screen: "#12", or the other agent / worktree. */
export interface LabelledOverlap {
  readonly label: string
  /** Sorted. */
  readonly files: readonly string[]
}

const byText = (a: string, b: string) => a.localeCompare(b)

const isSameTask = (a: TrackedWorktree, b: TrackedWorktree) =>
  a.taskNumber !== undefined && a.taskNumber === b.taskNumber

function sharedFiles(a: TrackedWorktree, b: TrackedWorktree): string[] {
  const other = new Set(b.files)
  return [...new Set(a.files)].filter((file) => other.has(file)).sort(byText)
}

/**
 * For each worktree, the other worktrees that changed some of the same files (advisory: these
 * will meet at merge time). Pairs on the same task are skipped: they are competing attempts at
 * one task, which Compare already shows side by side.
 */
export function findOverlaps(
  worktrees: readonly TrackedWorktree[],
): ReadonlyMap<string, readonly Overlap[]> {
  const result = new Map<string, readonly Overlap[]>()
  const add = (path: string, overlap: Overlap) =>
    result.set(path, [...(result.get(path) ?? []), overlap])
  worktrees.forEach((a, index) => {
    for (const b of worktrees.slice(index + 1)) {
      if (a.worktreePath === b.worktreePath || isSameTask(a, b)) continue
      const files = sharedFiles(a, b)
      if (files.length === 0) continue
      add(a.worktreePath, { worktreePath: b.worktreePath, files })
      add(b.worktreePath, { worktreePath: a.worktreePath, files })
    }
  })
  return result
}

/**
 * For Compare: each file that a worktree other than the compared `sides` changed too, with those
 * worktrees. Worktrees on the same task as a side are left out, like in `findOverlaps`.
 */
export function changedElsewhere(
  worktrees: readonly TrackedWorktree[],
  sides: readonly string[],
): ReadonlyMap<string, readonly string[]> {
  const sideWorktrees = worktrees.filter((worktree) => sides.includes(worktree.worktreePath))
  const others = worktrees.filter(
    (worktree) =>
      !sides.includes(worktree.worktreePath) &&
      !sideWorktrees.some((side) => isSameTask(side, worktree)),
  )
  const result = new Map<string, readonly string[]>()
  for (const other of others) {
    for (const file of new Set(other.files))
      result.set(file, [...(result.get(file) ?? []), other.worktreePath])
  }
  return result
}

/**
 * Names each overlap with `labelOf` and merges those that share a name (e.g. Claude's and
 * Codex's worktrees for #12 both become "#12"), sorted by name.
 */
export function labelOverlaps(
  overlaps: readonly Overlap[],
  labelOf: (worktreePath: string) => string,
): LabelledOverlap[] {
  const byLabel = new Map<string, Set<string>>()
  for (const overlap of overlaps) {
    const label = labelOf(overlap.worktreePath)
    byLabel.set(label, new Set([...(byLabel.get(label) ?? []), ...overlap.files]))
  }
  return [...byLabel]
    .map(([label, files]) => ({ label, files: [...files].sort(byText) }))
    .sort((a, b) => byText(a.label, b.label))
}

/** "also changed by #12, Codex (k3x9)" */
export function alsoChangedBy(labels: readonly string[]): string {
  return `also changed by ${labels.join(', ')}`
}

export function overlapSummary(overlaps: readonly LabelledOverlap[]): string {
  return alsoChangedBy(overlaps.map((overlap) => overlap.label))
}

/** Tooltip: each other agent and the files it changed too. */
export function overlapDetail(overlaps: readonly LabelledOverlap[]): string {
  return overlaps
    .map((overlap) => `${overlap.label} also changed:\n${overlap.files.join('\n')}`)
    .join('\n\n')
}
