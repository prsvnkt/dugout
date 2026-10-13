/** Which way a widget's arrow keys move: tabs go left/right, menus and trees up/down. */
export type Orientation = 'horizontal' | 'vertical'

export interface ArrowOptions {
  readonly orientation: Orientation
  /** Past the last item, go back to the first (tabs, menus); trees stop at the ends. */
  readonly wrap: boolean
}

const STEPS: Readonly<Record<Orientation, Readonly<Record<string, number>>>> = {
  horizontal: { ArrowRight: 1, ArrowLeft: -1 },
  vertical: { ArrowDown: 1, ArrowUp: -1 },
}

/**
 * The index a key moves to among `count` items (WAI-ARIA APG keyboard patterns), or null when
 * the key does not move. `current` is -1 when no item has focus yet.
 */
export function arrowTarget(
  key: string,
  current: number,
  count: number,
  options: ArrowOptions,
): number | null {
  if (count <= 0) return null
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  const step = STEPS[options.orientation][key]
  if (step === undefined) return null
  if (current < 0 || current >= count) return step > 0 ? 0 : count - 1
  const next = current + step
  if (options.wrap) return (next + count) % count
  return Math.min(Math.max(next, 0), count - 1)
}
