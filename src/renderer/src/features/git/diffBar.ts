import type { GitLineStats } from '@shared/git'

/** Filled width of the bar at its largest; the track is a little wider. */
export const BAR_MAX_PX = 30
const MIN_SEGMENT_PX = 2
/** A change of this many lines fills the bar. */
const FULL_BAR_LINES = 1000

export interface DiffBarWidths {
  readonly added: number
  readonly removed: number
}

/**
 * Pixel widths of the green and red segments. The filled width grows logarithmically with the
 * number of changed lines, so a 5-line tweak and a 500-line rewrite look different at a glance.
 */
export function diffBar(stats: GitLineStats): DiffBarWidths {
  if (stats.kind === 'binary') return { added: 0, removed: 0 }
  const total = stats.additions + stats.deletions
  if (total === 0) return { added: 0, removed: 0 }
  const scale = Math.log10(total + 1) / Math.log10(FULL_BAR_LINES + 1)
  const hasBoth = stats.additions > 0 && stats.deletions > 0
  const minFilled = hasBoth ? 2 * MIN_SEGMENT_PX : MIN_SEGMENT_PX
  const filled = Math.max(minFilled, Math.min(BAR_MAX_PX, Math.round(BAR_MAX_PX * scale)))
  if (!hasBoth)
    return stats.additions > 0 ? { added: filled, removed: 0 } : { added: 0, removed: filled }
  const share = Math.round((filled * stats.deletions) / total)
  const removed = Math.min(filled - MIN_SEGMENT_PX, Math.max(MIN_SEGMENT_PX, share))
  const added = filled - removed
  return { added, removed }
}
