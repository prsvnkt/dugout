import { useMemo } from 'react'
import type { DirEntry } from '@shared/files'
import type { GitChangeKind } from '@shared/git'
import type { Project } from '@shared/project'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { CHANGE_LETTER } from '@renderer/features/git/changeKind'
import { useCheckoutGit } from '@renderer/features/git/gitStore'
import { useSelectedCheckout } from '@renderer/features/workspace/workspaceStore'
import { useCheckoutTree, useExplorerStore } from './explorerStore'
import { iconFor } from './fileIcons'
import styles from './ExplorerPanel.module.css'

const INDENT_PX = 12

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
}

function TreeLevel({ project, dir, depth, marks, activePath }: TreeLevelProps) {
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
    const icon = iconFor(entry.name)
    return (
      <li key={entry.path} role="none">
        <button
          role="treeitem"
          aria-expanded={entry.kind === 'dir' ? isExpanded : undefined}
          aria-selected={entry.path === activePath}
          className={styles.row}
          data-ignored={entry.isIgnored}
          data-change={change ?? (hasChangesInside ? 'inside' : undefined)}
          style={{ paddingLeft: depth * INDENT_PX + 8 }}
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
            {entry.kind === 'dir' ? (isExpanded ? '▾' : '▸') : ''}
          </span>
          {entry.kind === 'file' && (
            <span className={styles.icon} style={{ color: icon.color }} aria-hidden>
              {icon.glyph}
            </span>
          )}
          <span className={styles.name}>{entry.name}</span>
          {change && (
            <span className={styles.mark} aria-hidden>
              {CHANGE_LETTER[change]}
            </span>
          )}
          {hasChangesInside && !change && <span className={styles.dot} aria-hidden />}
        </button>
        {isExpanded && (
          <TreeLevel
            project={project}
            dir={entry.path}
            depth={depth + 1}
            marks={marks}
            activePath={activePath}
          />
        )}
      </li>
    )
  }

  return (
    <ul
      className={styles.list}
      role={depth === 0 ? 'tree' : 'group'}
      aria-label={depth === 0 ? 'Files' : undefined}
    >
      {entries.map(renderEntry)}
    </ul>
  )
}

/** The file tree of the project's selected checkout (main or the focused worktree). */
export function ExplorerPanel({ project }: { project: Project }) {
  const checkout = useSelectedCheckout(project.id)
  const tree = useCheckoutTree(checkout)
  const collapseAll = useExplorerStore((state) => state.collapseAll)
  const refresh = useExplorerStore((state) => state.refresh)
  const setOpen = useExplorerStore((state) => state.setOpen)
  const marks = useGitMarks(project)
  const { tabs, activeTabId } = useProjectTabs(project.id)
  const activePath = tabs.find((tab) => tab.id === activeTabId)?.path ?? null
  const rootName = checkout.worktreePath?.split('/').pop() ?? project.name

  return (
    <aside className={styles.panel} aria-label="Explorer">
      <header className={styles.header}>
        <span className={styles.title}>Explorer</span>
        <button
          onClick={() => void refresh(checkout)}
          title="Refresh"
          aria-label="Refresh explorer"
        >
          ↻
        </button>
        <button
          onClick={() => collapseAll(checkout)}
          title="Collapse all"
          aria-label="Collapse all folders"
        >
          ⊟
        </button>
        <button
          onClick={() => setOpen(false)}
          title="Hide explorer (⌘B)"
          aria-label="Hide Explorer"
        >
          «
        </button>
      </header>
      <div className={styles.root} title={checkout.worktreePath ?? project.rootPath}>
        {rootName}
      </div>
      {tree.error ? (
        <p className={styles.error}>{tree.error}</p>
      ) : (
        <div className={styles.scroll}>
          <TreeLevel project={project} dir="" depth={0} marks={marks} activePath={activePath} />
        </div>
      )}
    </aside>
  )
}
