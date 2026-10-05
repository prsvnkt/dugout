import { useEffect, type ReactNode } from 'react'
import { Panel, usePanelRef } from 'react-resizable-panels'
import styles from './SidePanel.module.css'

/** Width of a collapsed side panel: a slim rail with a button to expand it again. */
const RAIL_PX = 28

interface SidePanelProps {
  readonly id: string
  readonly side: 'left' | 'right'
  readonly label: string
  readonly isExpanded: boolean
  onExpandedChange(isExpanded: boolean): void
  readonly defaultSize: number
  readonly minSize: number
  readonly maxSize: string
  readonly children: ReactNode
}

/**
 * A resizable side panel that collapses to a rail (button, ⌘-shortcut, or dragging it closed).
 * It always stays mounted in its slot, so collapsing never remounts neighbouring panels.
 */
export function SidePanel(props: SidePanelProps) {
  const { id, side, label, isExpanded, onExpandedChange, defaultSize, minSize, maxSize } = props
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
      collapsedSize={RAIL_PX}
      defaultSize={defaultSize}
      minSize={minSize}
      maxSize={maxSize}
      onResize={(size) => {
        const isCollapsed = size.inPixels <= RAIL_PX + 1
        if (isCollapsed === isExpanded) onExpandedChange(!isCollapsed)
      }}
    >
      {isExpanded ? (
        props.children
      ) : (
        <button
          className={styles.rail}
          data-side={side}
          onClick={() => onExpandedChange(true)}
          aria-label={`Show ${label}`}
          title={`Show ${label}`}
        >
          <span className={styles.chevron} aria-hidden>
            {side === 'left' ? '»' : '«'}
          </span>
          <span className={styles.railLabel} aria-hidden>
            {label}
          </span>
        </button>
      )}
    </Panel>
  )
}
