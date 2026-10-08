import type { ReactNode } from 'react'
import { Panel } from 'react-resizable-panels'
import { useCollapsiblePanel } from './useCollapsiblePanel'

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
  const { panelRef, onResize } = useCollapsiblePanel(isExpanded, onExpandedChange, COLLAPSED_PX)

  return (
    <Panel
      id={id}
      panelRef={panelRef}
      collapsible
      collapsedSize={COLLAPSED_PX}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      onResize={onResize}
    >
      {isExpanded && props.children}
    </Panel>
  )
}
