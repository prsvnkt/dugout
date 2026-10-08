import { Group, Panel, Separator } from 'react-resizable-panels'
import type { Project } from '@shared/project'
import { AgentsPanel } from '@renderer/features/agents/AgentsPanel'
import { useAgentsStore } from '@renderer/features/agents/agentsStore'
import { ExplorerPanel } from '@renderer/features/explorer/ExplorerPanel'
import { useCollapsiblePanel } from './useCollapsiblePanel'
import styles from './ProjectWorkspace.module.css'

/** Matches --pane-header-height: a minimised Agents list keeps only its header. */
const AGENTS_HEADER_PX = 38
const DEFAULT_AGENTS_SIZE = '45%'
const MIN_AGENTS_PX = 120
const MIN_EXPLORER_PX = 120

/** The left sidebar: the project's agents above its files; the agents half minimises. */
export function LeftSidebar({ project }: { project: Project }) {
  const isCollapsed = useAgentsStore((state) => state.isCollapsed)
  const setCollapsed = useAgentsStore((state) => state.setCollapsed)
  const { panelRef, onResize } = useCollapsiblePanel(
    !isCollapsed,
    (isExpanded) => setCollapsed(!isExpanded),
    AGENTS_HEADER_PX,
  )

  return (
    <Group orientation="vertical" className={styles.sidebar}>
      <Panel
        id="agents"
        panelRef={panelRef}
        collapsible
        collapsedSize={AGENTS_HEADER_PX}
        defaultSize={DEFAULT_AGENTS_SIZE}
        minSize={MIN_AGENTS_PX}
        onResize={onResize}
      >
        <AgentsPanel project={project} />
      </Panel>
      <Separator className={styles.separatorHorizontal} />
      <Panel id="files" minSize={MIN_EXPLORER_PX}>
        <ExplorerPanel project={project} />
      </Panel>
    </Group>
  )
}
