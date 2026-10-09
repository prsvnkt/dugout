import { useState } from 'react'
import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { GitChangeKind, GitLineStats } from '@shared/git'
import { Icon } from '@renderer/lib/Icon'
import { FileRow } from './FileRow'
import styles from './GitPanel.module.css'

/** The diff currently open in the editor, highlighted in the list. */
export interface GitSelection {
  readonly path: string
  readonly staged: boolean
}

export interface ChangeEntry {
  readonly path: string
  readonly kind: GitChangeKind
  /** Null when unknown. */
  readonly stats: GitLineStats | null
}

interface ChangeSectionProps {
  readonly title: string
  readonly entries: readonly ChangeEntry[]
  readonly isStaged: boolean
  readonly selection: GitSelection | null
  readonly isBusy: boolean
  /** "Stage all" / "Unstage all": the accessible name of the hover action in the header. */
  readonly bulkLabel: string
  /** Icon for the bulk action, like the row actions: plus or minus. */
  readonly bulkIcon: LucideIcon
  onBulk(): void
  onSelect(path: string): void
  onStage?(path: string): void
  onUnstage?(path: string): void
  onDiscard?(path: string): void
}

/** A collapsible group of changes, like VS Code's "Staged Changes" / "Changes". */
export function ChangeSection(props: ChangeSectionProps) {
  const { title, entries, isStaged, selection, isBusy, bulkLabel, bulkIcon, onBulk, onSelect } =
    props
  const [isOpen, setIsOpen] = useState(true)
  if (entries.length === 0) return null

  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.sectionHeader}>
        <button
          className={styles.sectionToggle}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          <Icon icon={ChevronRight} className={styles.sectionChevron} />
          <h3 className={styles.sectionTitle}>{title}</h3>
        </button>
        <button
          className={styles.sectionAction}
          onClick={onBulk}
          disabled={isBusy}
          aria-label={bulkLabel}
          title={bulkLabel}
        >
          <Icon icon={bulkIcon} />
        </button>
        <span className={styles.countPill} aria-label={`${entries.length} files`}>
          {entries.length}
        </span>
      </header>
      {isOpen && (
        <ul className={styles.fileList}>
          {entries.map(({ path, kind, stats }) => (
            <FileRow
              key={path}
              path={path}
              kind={kind}
              stats={stats}
              isBusy={isBusy}
              isSelected={selection?.path === path && selection.staged === isStaged}
              onSelect={() => onSelect(path)}
              {...(props.onStage && { onStage: () => props.onStage?.(path) })}
              {...(props.onUnstage && { onUnstage: () => props.onUnstage?.(path) })}
              {...(props.onDiscard && { onDiscard: () => props.onDiscard?.(path) })}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
