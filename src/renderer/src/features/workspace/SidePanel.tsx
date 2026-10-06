import { useEffect, type ReactNode } from 'react'
import { Panel, usePanelRef } from 'react-resizable-panels'

/** A collapsed side panel takes no space; the activity rail brings it back. */
const COLLAPSED_PX = 0

interface SidePanelProps {
  readonly id: string
  readonly isExpanded: boolean
  onExpandedChange(isExpanded: boolean): void
  readonly defaultSize: number
  readonly minSize: number
  readonly maxSize: string
  readonly children: ReactNode
}

/**
 * A resizable side panel that collapses (activity rail, ⌘-shortcut, or dragging it closed).
 * It always stays mounted in its slot, so collapsing never remounts neighbouring panels.
 */
export function SidePanel(props: SidePanelProps) {
  const { id, isExpanded, onExpandedChange, defaultSize, minSize, maxSize } = props
  const panelRef = usePanelRef()

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    if (isExpanded && panel.isCollapsed()) panel.expand()
    if (!isExpanded && !panel.isCollapsed()) panel.collapse()
  }, [isExpanded, panelRef])

  return (
    <Panel
      id={id}
      panelRef={panelRef}
      collapsible
      collapsedSize={COLLAPSED_PX}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      onResize={(size) => {
        const isCollapsed = size.inPixels <= COLLAPSED_PX + 1
        if (isCollapsed === isExpanded) onExpandedChange(!isCollapsed)
      }}
    >
      {isExpanded && props.children}
    </Panel>
  )
}
