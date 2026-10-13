import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react'
import { ChevronRight } from 'lucide-react'
import type { GitChangeKind } from '@shared/git'
import type { Project } from '@shared/project'
import type { GitCheckout } from '@shared/worktree'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { CHANGE_LETTER } from '@renderer/features/git/changeKind'
import { useCheckoutGit } from '@renderer/features/git/gitStore'
import { useSelectedCheckout } from '@renderer/features/workspace/workspaceStore'
import { Icon } from '@renderer/lib/Icon'
import { useVirtualRows } from '@renderer/lib/useVirtualRows'
import { renderedIndices } from '@renderer/lib/virtualRows'
import { useCheckoutTree, useExplorerStore } from './explorerStore'
import { FileTypeIcon } from './FileTypeIcon'
import { tabStopPath, treeKeyMove, visibleRows, type TreeRow } from './treeKeys'
import styles from './ExplorerPanel.module.css'

const INDENT_PX = 12
const ROW_INSET_PX = 6
/** Every row is this tall: the windowing (decision 062) relies on one fixed height. */
const ROW_HEIGHT_PX = 24

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

interface TreeRowItemProps {
  readonly row: TreeRow
  readonly index: number
  readonly marks: GitMarks
  readonly isActive: boolean
  /** The one row in the Tab order (roving tabindex); arrows move it. */
  readonly isTabStop: boolean
  onFocusPath(path: string): void
  onActivate(row: TreeRow): void
  onOpenPinned(row: TreeRow): void
}

function TreeRowItem(props: TreeRowItemProps) {
  const { row, index, marks, isActive, isTabStop, onFocusPath, onActivate, onOpenPinned } = props
  const { entry, depth } = row
  const change = marks.files.get(entry.path)
  const hasChangesInside = row.isDir && marks.dirs.has(entry.path)
  return (
    <button
      role="treeitem"
      aria-level={depth + 1}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      tabIndex={isTabStop ? 0 : -1}
      data-path={entry.path}
      onFocus={() => onFocusPath(entry.path)}
      aria-expanded={row.isDir ? row.isExpanded : undefined}
      aria-selected={isActive}
      className={styles.row}
      data-ignored={entry.isIgnored}
      data-change={change ?? (hasChangesInside ? 'inside' : undefined)}
      style={{
        height: ROW_HEIGHT_PX,
        paddingLeft: depth * INDENT_PX + ROW_INSET_PX,
        transform: `translateY(${index * ROW_HEIGHT_PX}px)`,
      }}
      title={entry.path}
      aria-label={
        entry.name + (change ? ` — ${change}` : hasChangesInside ? ' — contains changes' : '')
      }
      onClick={() => onActivate(row)}
      onDoubleClick={() => onOpenPinned(row)}
    >
      <span className={styles.chevron} aria-hidden>
        {/* Points right; CSS turns it down when the folder is expanded. */}
        {row.isDir && <Icon icon={ChevronRight} />}
      </span>
      {!row.isDir && <FileTypeIcon name={entry.name} />}
      <span className={styles.name}>{entry.name}</span>
      {change && (
        <span className={styles.mark} aria-hidden>
          {CHANGE_LETTER[change]}
        </span>
      )}
      {hasChangesInside && !change && <span className={styles.dot} aria-hidden />}
    </button>
  )
}

interface TreeKeysOptions {
  readonly checkout: GitCheckout
  readonly rows: readonly TreeRow[]
  readonly activePath: string | null
  readonly treeRef: RefObject<HTMLDivElement | null>
  scrollToIndex(index: number): void
}

const rowElement = (tree: HTMLElement | null, path: string) =>
  tree?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`) ?? null

/**
 * The tree's keyboard (APG tree view): which row takes Tab, and what the arrow keys do. A row
 * outside the window is scrolled to, rendered (it becomes the Tab row), then focused.
 */
function useTreeKeys({ checkout, rows, activePath, treeRef, scrollToIndex }: TreeKeysOptions) {
  const toggleDir = useExplorerStore((state) => state.toggleDir)
  const [focusedPath, setFocusedPath] = useState<string | null>(null)
  const pendingFocus = useRef<string | null>(null)
  const tabStop = tabStopPath(rows, [focusedPath, activePath])

  useLayoutEffect(() => {
    const path = pendingFocus.current
    const element = path === null ? null : rowElement(treeRef.current, path)
    if (!element) return
    pendingFocus.current = null
    element.focus({ preventScroll: true })
  })

  const focusRow = (path: string) => {
    scrollToIndex(rows.findIndex((row) => row.path === path))
    setFocusedPath(path)
    const element = rowElement(treeRef.current, path)
    if (element) element.focus({ preventScroll: true })
    else pendingFocus.current = path
  }

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    const move = treeKeyMove(rows, focusedPath, event.key)
    if (!move) return
    event.preventDefault()
    if (move.kind === 'toggle') return void toggleDir(checkout, move.path)
    focusRow(move.path)
  }
  return { tabStop, onKeyDown, onFocusPath: setFocusedPath }
}

/**
 * The file tree of the selected checkout: one `tree` over the flat visible rows, of which only
 * a window (plus the Tab row) is in the DOM, so an expanded node_modules stays cheap.
 */
export function FileTree({ project, activePath }: { project: Project; activePath: string | null }) {
  const checkout = useSelectedCheckout(project.id)
  const tree = useCheckoutTree(checkout)
  const toggleDir = useExplorerStore((state) => state.toggleDir)
  const openFile = useEditorStore((state) => state.openFile)
  const marks = useGitMarks(project)
  const rows = useMemo(() => visibleRows(tree.entries, tree.expanded), [tree])
  const treeRef = useRef<HTMLDivElement>(null)
  const virtual = useVirtualRows(treeRef, ROW_HEIGHT_PX, rows.length)
  const { tabStop, onKeyDown, onFocusPath } = useTreeKeys({
    checkout,
    rows,
    activePath,
    treeRef,
    scrollToIndex: virtual.scrollToIndex,
  })
  const tabStopIndex = rows.findIndex((row) => row.path === tabStop)
  const worktreePath = checkout.worktreePath ?? null

  const onActivate = (row: TreeRow) =>
    row.isDir
      ? void toggleDir(checkout, row.path)
      : openFile(project.id, worktreePath, row.path, true)
  const onOpenPinned = (row: TreeRow) =>
    !row.isDir && openFile(project.id, worktreePath, row.path, false)

  return (
    <div
      className={styles.scroll}
      role="tree"
      aria-label="Files"
      ref={treeRef}
      onKeyDown={onKeyDown}
    >
      <div className={styles.rows} role="none" style={{ height: virtual.totalHeight }}>
        {renderedIndices(virtual.range, tabStopIndex).map((index) => {
          const row = rows[index]
          if (!row) return null
          return (
            <TreeRowItem
              key={row.path}
              row={row}
              index={index}
              marks={marks}
              isActive={row.path === activePath}
              isTabStop={index === tabStopIndex}
              onFocusPath={onFocusPath}
              onActivate={onActivate}
              onOpenPinned={onOpenPinned}
            />
          )
        })}
      </div>
    </div>
  )
}
