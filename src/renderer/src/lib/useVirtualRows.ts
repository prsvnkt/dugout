import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import {
  isSameRange,
  scrollTopToReveal,
  totalHeight,
  windowRange,
  type RowRange,
  type Viewport,
} from './virtualRows'

/** Rows rendered beyond each edge of the viewport, so a fast scroll does not show a gap. */
const DEFAULT_OVERSCAN = 8

export interface VirtualRows {
  /** The rows to render; position row `i` at `translateY(i * rowHeight)`. */
  readonly range: RowRange
  /** The height of the whole list, for the sizer inside the scroll container. */
  readonly totalHeight: number
  /** Scrolls the least distance that shows row `index` in full. */
  scrollToIndex(index: number): void
}

/**
 * Windows a long list of fixed-height rows inside the scroll container `containerRef` (decision
 * 062). Re-renders only when the window moves by a row or the container resizes, not per pixel.
 */
export function useVirtualRows(
  containerRef: RefObject<HTMLElement | null>,
  rowHeight: number,
  count: number,
  overscan = DEFAULT_OVERSCAN,
): VirtualRows {
  const [viewport, setViewport] = useState<Viewport>({ scrollTop: 0, height: 0 })
  const countRef = useRef(count)
  useLayoutEffect(() => {
    countRef.current = count
  }, [count])

  const sync = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    const next = { scrollTop: element.scrollTop, height: element.clientHeight }
    setViewport((previous) => {
      const isSame =
        previous.height === next.height &&
        isSameRange(
          windowRange(previous, rowHeight, countRef.current, overscan),
          windowRange(next, rowHeight, countRef.current, overscan),
        )
      return isSame ? previous : next
    })
  }, [containerRef, rowHeight, overscan])

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return
    sync()
    element.addEventListener('scroll', sync, { passive: true })
    const observer = new ResizeObserver(sync)
    observer.observe(element)
    return () => {
      element.removeEventListener('scroll', sync)
      observer.disconnect()
    }
  }, [containerRef, sync])

  const scrollToIndex = useCallback(
    (index: number) => {
      const element = containerRef.current
      if (!element) return
      const current = { scrollTop: element.scrollTop, height: element.clientHeight }
      const top = scrollTopToReveal(index, current, rowHeight)
      if (top === null) return
      element.scrollTop = top
      sync()
    },
    [containerRef, rowHeight, sync],
  )

  // A viewport stored before rows went away can sit past the end; the range clamps it.
  return {
    range: windowRange(viewport, rowHeight, count, overscan),
    totalHeight: totalHeight(count, rowHeight),
    scrollToIndex,
  }
}
