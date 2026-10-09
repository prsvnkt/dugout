import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react'
import { arrowTarget, type ArrowOptions } from './arrowNavigation'

export const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)'

interface ArrowNavigationOptions extends ArrowOptions {
  /** The items the arrows move between, inside the element that gets `onKeyDown`. */
  readonly itemSelector: string
  /** Runs after focus moves, e.g. a tab list activates the newly focused tab. */
  readonly onMove?: (item: HTMLElement) => void
}

/**
 * A keydown handler for a composite widget (tab list, menu): Arrow keys along the orientation,
 * Home and End move focus between its items. Modified keys are left to app shortcuts.
 */
export function useArrowNavigation(
  options: ArrowNavigationOptions,
): (event: KeyboardEvent<HTMLElement>) => void {
  const { itemSelector, orientation, wrap, onMove } = options
  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      const items = [...event.currentTarget.querySelectorAll<HTMLElement>(itemSelector)]
      const current = items.indexOf(document.activeElement as HTMLElement)
      const next = arrowTarget(event.key, current, items.length, { orientation, wrap })
      const item = next === null ? undefined : items[next]
      if (!item) return
      event.preventDefault()
      item.focus()
      onMove?.(item)
    },
    [itemSelector, orientation, wrap, onMove],
  )
}

/**
 * Keyboard for a menu (APG menu button): focus moves to its first item when it opens (unless
 * an item already took it), and Up/Down/Home/End move between items, wrapping.
 */
export function useMenuKeys(
  menuRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
): (event: KeyboardEvent<HTMLElement>) => void {
  useEffect(() => {
    const menu = menuRef.current
    if (!isOpen || !menu || menu.contains(document.activeElement)) return
    menu.querySelector<HTMLElement>(MENU_ITEM_SELECTOR)?.focus()
  }, [menuRef, isOpen])
  return useArrowNavigation({
    itemSelector: MENU_ITEM_SELECTOR,
    orientation: 'vertical',
    wrap: true,
  })
}
