import { useEffect, useRef, type RefObject } from 'react'

/**
 * Closes a popover on Escape or on a mouse press outside `ref`, while it is open. When it
 * closes with focus inside it (or with focus lost along with it), focus goes back to
 * `triggerRef`, the button that opened it.
 */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
  triggerRef?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss()
    }
    // The dispatch path, not `contains(target)`: a click can re-render the popover and detach
    // the clicked element before this window listener runs.
    const onMouseDown = (event: MouseEvent) => {
      const element = ref.current
      if (!element || !event.composedPath().includes(element)) onDismiss()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onMouseDown)
    }
  }, [ref, isOpen, onDismiss])

  useReturnFocus(ref, isOpen, triggerRef)
}

/** Once `isOpen` turns false, refocuses the trigger if focus is in `ref` or was dropped. */
function useReturnFocus(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  triggerRef: RefObject<HTMLElement | null> | undefined,
): void {
  const wasOpen = useRef(false)
  useEffect(() => {
    if (isOpen) {
      wasOpen.current = true
      return
    }
    if (!wasOpen.current) return
    wasOpen.current = false
    const active = document.activeElement
    const isFocusLost = active === null || active === document.body
    if (isFocusLost || ref.current?.contains(active)) triggerRef?.current?.focus()
  }, [ref, isOpen, triggerRef])
}
