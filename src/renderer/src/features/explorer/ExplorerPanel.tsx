import { ChevronsDownUp, RefreshCw } from 'lucide-react'
import type { Project } from '@shared/project'
import { useProjectTabs } from '@renderer/features/editor/editorStore'
import { OpenInMenu } from '@renderer/features/openIn/OpenInMenu'
import { useSelectedCheckout } from '@renderer/features/workspace/workspaceStore'
import { Icon } from '@renderer/lib/Icon'
import { useCheckoutTree, useExplorerStore } from './explorerStore'
import { FileTree } from './FileTree'
import styles from './ExplorerPanel.module.css'

/** The file tree of the project's selected checkout (main or the focused worktree). */
export function ExplorerPanel({ project }: { project: Project }) {
  const checkout = useSelectedCheckout(project.id)
  const tree = useCheckoutTree(checkout)
  const collapseAll = useExplorerStore((state) => state.collapseAll)
  const refresh = useExplorerStore((state) => state.refresh)
  const { tabs, activeTabId } = useProjectTabs(project.id)
  const activePath = tabs.find((tab) => tab.id === activeTabId)?.path ?? null
  const rootName = checkout.worktreePath?.split('/').pop() ?? project.name

  return (
    <aside className={styles.panel} aria-label="Explorer">
      <header className={styles.header}>
        <span className={styles.root} title={checkout.worktreePath ?? project.rootPath}>
          {rootName}
        </span>
        <OpenInMenu
          checkout={checkout}
          target={checkout.worktreePath === undefined ? 'project' : 'worktree'}
        />
        <button
          onClick={() => void refresh(checkout)}
          title="Refresh"
          aria-label="Refresh explorer"
        >
          <Icon icon={RefreshCw} />
        </button>
        <button
          onClick={() => collapseAll(checkout)}
          title="Collapse all"
          aria-label="Collapse all folders"
        >
          <Icon icon={ChevronsDownUp} />
        </button>
      </header>
      {tree.error ? (
        <p className={styles.error}>{tree.error}</p>
      ) : (
        <FileTree project={project} activePath={activePath} />
      )}
    </aside>
  )
}
