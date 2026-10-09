import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronRight, ChevronsDownUp, RefreshCw } from 'lucide-react'
import type { DirEntry } from '@shared/files'
import type { GitChangeKind } from '@shared/git'
import type { Project } from '@shared/project'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { CHANGE_LETTER } from '@renderer/features/git/changeKind'
import { useCheckoutGit } from '@renderer/features/git/gitStore'
import { OpenInMenu } from '@renderer/features/openIn/OpenInMenu'
import { useSelectedCheckout } from '@renderer/features/workspace/workspaceStore'
import { Icon } from '@renderer/lib/Icon'
import { useCheckoutTree, useExplorerStore } from './explorerStore'
import { FileTypeIcon } from './FileTypeIcon'
import { tabStopPath, treeKeyMove, visibleRows } from './treeKeys'
import styles from './ExplorerPanel.module.css'

const INDENT_PX = 12
const ROW_INSET_PX = 6

interface GitMarks {
  readonly files: ReadonlyMap<string, GitChangeKind>
  readonly dirs: ReadonlySet<string>
}

/** Per-path change kinds, plus every folder that contains a change. */
function useGitMarks(project: Project): GitMarks {
  const status = useCheckoutGit(useSelectedCheckout(project.id)).status
  return useMemo(() => {
    const files = new Map<string, GitChangeKind>()
    const dirs = new Set<string>()
    for (const file of status?.files ?? []) {
      const kind = file.unstaged ?? file.staged
      if (!kind) continue
      files.set(file.path, kind)
      const parts = file.path.split('/')
      for (let depth = 1; depth < parts.length; depth++) dirs.add(parts.slice(0, depth).join('/'))
    }
    return { files, dirs }
  }, [status])
}

interface TreeLevelProps {
  readonly project: Project
  readonly dir: string
  readonly depth: number
  readonly marks: GitMarks
  readonly activePath: string | null
  /** The one row in the Tab order (roving tabindex); arrows move it. */
  readonly tabStop: string | null
  onFocusPath(path: string): void
}

function TreeLevel(props: TreeLevelProps) {
  const { project, dir, depth, marks, activePath, tabStop, onFocusPath } = props
  const checkout = useSelectedCheckout(project.id)
  const tree = useCheckoutTree(checkout)
  const toggleDir = useExplorerStore((state) => state.toggleDir)
  const openFile = useEditorStore((state) => state.openFile)
  const entries = tree.entries[dir] ?? []
  const worktreePath = checkout.worktreePath ?? null

  const renderEntry = (entry: DirEntry) => {
    const isExpanded = entry.kind === 'dir' && tree.expanded.includes(entry.path)
    const change = marks.files.get(entry.path)
    const hasChangesInside = entry.kind === 'dir' && marks.dirs.has(entry.path)
    return (
      <li key={entry.path} role="none">
        <button
          role="treeitem"
          aria-level={depth + 1}
          tabIndex={entry.path === tabStop ? 0 : -1}
          data-path={entry.path}
          onFocus={() => onFocusPath(entry.path)}
          aria-expanded={entry.kind === 'dir' ? isExpanded : undefined}
          aria-selected={entry.path === activePath}
          className={styles.row}
          data-ignored={entry.isIgnored}
          data-change={change ?? (hasChangesInside ? 'inside' : undefined)}
          style={{ paddingLeft: depth * INDENT_PX + ROW_INSET_PX }}
          title={entry.path}
          aria-label={
            entry.name + (change ? ` — ${change}` : hasChangesInside ? ' — contains changes' : '')
          }
          onClick={() =>
            entry.kind === 'dir'
              ? void toggleDir(checkout, entry.path)
              : openFile(project.id, worktreePath, entry.path, true)
          }
          onDoubleClick={() =>
            entry.kind === 'file' && openFile(project.id, worktreePath, entry.path, false)
          }
        >
          <span className={styles.chevron} aria-hidden>
            {/* Points right; CSS turns it down when the folder is expanded. */}
            {entry.kind === 'dir' && <Icon icon={ChevronRight} />}
          </span>
          {entry.kind === 'file' && <FileTypeIcon name={entry.name} />}
          <span className={styles.name}>{entry.name}</span>
          {change && (
            <span className={styles.mark} aria-hidden>
              {CHANGE_LETTER[change]}
            </span>
          )}
          {hasChangesInside && !change && <span className={styles.dot} aria-hidden />}
        </button>
        {isExpanded && <TreeLevel {...props} dir={entry.path} depth={depth + 1} />}
      </li>
    )
  }

  return (
    // The root list is plain: its rows belong straight to the `tree` around it.
    <ul className={styles.list} role={depth === 0 ? 'none' : 'group'}>
      {entries.map(renderEntry)}
    </ul>
  )
}

/** The tree's keyboard (APG tree view): which row takes Tab, and what the arrow keys do. */
function useTreeKeys(project: Project, activePath: string | null) {
  const checkout = useSelectedCheckout(project.id)
  const tree = useCheckoutTree(checkout)
  const toggleDir = useExplorerStore((state) => state.toggleDir)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const treeRef = useRef<HTMLDivElement>(null)
  const rows = useMemo(() => visibleRows(tree.entries, tree.expanded), [tree])
  const tabStop = tabStopPath(rows, [focusedPath, activePath])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const move = treeKeyMove(rows, focusedPath, event.key)
    if (!move) return
    event.preventDefault()
    if (move.kind === 'toggle') return void toggleDir(checkout, move.path)
    treeRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(move.path)}"]`)?.focus()
  }
  return { treeRef, tabStop, onKeyDown, onFocusPath: setFocusedPath }
}

/** The root of the file tree: one `tree` that owns every level's keyboard. */
function FileTree({
  project,
  marks,
  activePath,
}: Omit<TreeLevelProps, 'dir' | 'depth' | 'tabStop' | 'onFocusPath'>) {
  const { treeRef, tabStop, onKeyDown, onFocusPath } = useTreeKeys(project, activePath)
  return (
    <div
      className={styles.scroll}
      role="tree"
      aria-label="Files"
      ref={treeRef}
      onKeyDown={onKeyDown}
    >
      <TreeLevel
        project={project}
        dir=""
        depth={0}
        marks={marks}
        activePath={activePath}
        tabStop={tabStop}
        onFocusPath={onFocusPath}
      />
    </div>
  )
}

/** The file tree of the project's selected checkout (main or the focused worktree). */
export function ExplorerPanel({ project }: { project: Project }) {
  const checkout = useSelectedCheckout(project.id)
  const tree = useCheckoutTree(checkout)
  const collapseAll = useExplorerStore((state) => state.collapseAll)
  const refresh = useExplorerStore((state) => state.refresh)
  const marks = useGitMarks(project)
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
        <FileTree project={project} marks={marks} activePath={activePath} />
      )}
    </aside>
  )
}
