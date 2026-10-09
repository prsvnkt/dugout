/** Windowing math for long lists of fixed-height rows (decision 062). Pure; see `useVirtualRows`. */

/** Where a scroll container is: its scroll offset and visible height, in px. */
export interface Viewport {
  readonly scrollTop: number
  readonly height: number
}

/** The rows to render: `start` included, `end` excluded. */
export interface RowRange {
  readonly start: number
  readonly end: number
}

/** The rows on screen (partly shown ones included), widened by `overscan` rows on each side. */
export function windowRange(
  viewport: Viewport,
  rowHeight: number,
  count: number,
  overscan: number,
): RowRange {
  const firstShown = Math.floor(viewport.scrollTop / rowHeight)
  const afterLastShown = Math.ceil((viewport.scrollTop + viewport.height) / rowHeight)
  return {
    start: Math.min(count, Math.max(0, firstShown - overscan)),
    end: Math.min(count, afterLastShown + overscan),
  }
}

/** The height of the whole list, so the scrollbar matches it. */
export function totalHeight(count: number, rowHeight: number): number {
  return count * rowHeight
}

/** The scrollTop that shows row `index` in full with the least movement; null if it already is. */
export function scrollTopToReveal(
  index: number,
  viewport: Viewport,
  rowHeight: number,
): number | null {
  const top = index * rowHeight
  const bottom = top + rowHeight
  if (top < viewport.scrollTop) return top
  if (bottom > viewport.scrollTop + viewport.height) return bottom - viewport.height
  return null
}

export function isSameRange(a: RowRange, b: RowRange): boolean {
  return a.start === b.start && a.end === b.end
}

/**
 * The indices to render: the window, plus a pinned row outside it (the tree's focused / Tab
 * row, so focus and the Tab order survive scrolling it away). -1 or null pins nothing.
 */
export function renderedIndices(range: RowRange, pinned: number | null): readonly number[] {
  const shown = Array.from({ length: range.end - range.start }, (_, offset) => range.start + offset)
  if (pinned === null || pinned < 0 || (pinned >= range.start && pinned < range.end)) return shown
  return pinned < range.start ? [pinned, ...shown] : [...shown, pinned]
}
