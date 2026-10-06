import type { GitChangeKind } from '@shared/git'
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
}

interface ChangeSectionProps {
  readonly title: string
  readonly entries: readonly ChangeEntry[]
  readonly isStaged: boolean
  readonly selection: GitSelection | null
  readonly isBusy: boolean
  readonly bulkLabel: string
  onBulk(): void
  onSelect(path: string): void
  onStage?(path: string): void
  onUnstage?(path: string): void
  onDiscard?(path: string): void
}

export function ChangeSection(props: ChangeSectionProps) {
  const { title, entries, isStaged, selection, isBusy, bulkLabel, onBulk, onSelect } = props
  if (entries.length === 0) return null

  return (
    <section className={styles.section} aria-label={title}>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          {title} · {entries.length}
        </h3>
        <button className={styles.linkButton} onClick={onBulk} disabled={isBusy}>
          {bulkLabel}
        </button>
      </header>
      <ul className={styles.fileList}>
        {entries.map(({ path, kind }) => (
          <FileRow
            key={path}
            path={path}
            kind={kind}
            isBusy={isBusy}
            isSelected={selection?.path === path && selection.staged === isStaged}
            onSelect={() => onSelect(path)}
            {...(props.onStage && { onStage: () => props.onStage?.(path) })}
            {...(props.onUnstage && { onUnstage: () => props.onUnstage?.(path) })}
            {...(props.onDiscard && { onDiscard: () => props.onDiscard?.(path) })}
          />
        ))}
      </ul>
    </section>
  )
}
