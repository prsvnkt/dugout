import { useEffect } from 'react'
import { usePanelRef, type PanelSize } from 'react-resizable-panels'

/**
 * Keeps a collapsible panel in step with a stored open/closed flag, both ways: the flag
 * collapses or expands the panel, and dragging it closed (or open) updates the flag.
 */
export function useCollapsiblePanel(
  isExpanded: boolean,
  onExpandedChange: (isExpanded: boolean) => void,
  collapsedPx: number,
) {
  const panelRef = usePanelRef()

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (isExpanded && panel.isCollapsed()) panel.expand()
    if (!isExpanded && !panel.isCollapsed()) panel.collapse()
  }, [isExpanded, panelRef])

  const onResize = (size: PanelSize, _id: unknown, previous: PanelSize | undefined) => {
    // The first report comes before layout (0px in a vertical group); it is not a drag.
    if (previous === undefined) return
    const isCollapsed = size.inPixels <= collapsedPx + 1
    if (isCollapsed === isExpanded) onExpandedChange(!isCollapsed)
  }

  return { panelRef, onResize }
}
