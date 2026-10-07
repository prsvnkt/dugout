import { useEffect, type RefObject } from 'react'

/** Closes a popover on Escape or on a mouse press outside `ref`, while it is open. */
export function useDismiss(
  ref: RefObject<HTMLElement | null>,
  isOpen: boolean,
  onDismiss: () => void,
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
}
