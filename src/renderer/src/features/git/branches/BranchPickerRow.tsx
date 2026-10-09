import { ChevronDown, ChevronRight, Cloud, GitBranch, GitFork, Plus } from 'lucide-react'
import { formatAge } from '@renderer/lib/formatAge'
import { Icon } from '@renderer/lib/Icon'
import type { PickerItem } from './pickerSections'
import styles from './BranchPicker.module.css'

interface BranchPickerRowProps {
  readonly item: PickerItem
  readonly isActive: boolean
  /** Waiting for a second Enter/click because agents are busy in this checkout. */
  readonly isArmed: boolean
  onActivate(): void
  onHover(): void
}

function Content({ item }: { item: PickerItem }) {
  switch (item.kind) {
    case 'create':
      return (
        <span className={styles.title}>
          <Icon icon={Plus} className={styles.glyph} /> Create branch “{item.name}”
        </span>
      )
    case 'createFrom':
      return (
        <span className={styles.title}>
          <Icon icon={Plus} className={styles.glyph} /> Create “{item.name}” from…
        </span>
      )
    case 'worktree':
      return (
        <>
          <span className={styles.title}>
            <Icon icon={GitFork} className={styles.glyph} /> New worktree session
          </span>
          <span className={styles.detail}>An agent on its own branch; this checkout stays put</span>
        </>
      )
    case 'sessions':
      return (
        <span className={styles.title}>
          <Icon icon={item.isExpanded ? ChevronDown : ChevronRight} className={styles.glyph} />
          {item.isExpanded
            ? 'Hide agent session branches'
            : `${item.count} agent session ${item.count === 1 ? 'branch' : 'branches'}`}
        </span>
      )
    case 'branch': {
      const { branch } = item
      const { commit } = branch
      return (
        <>
          <span className={styles.title}>
            <Icon icon={branch.kind === 'remote' ? Cloud : GitBranch} className={styles.glyph} />
            <span className={styles.name}>{branch.name}</span>
            <span className={styles.age}>{formatAge(commit.date)}</span>
          </span>
          <span className={styles.detail}>
            {commit.author} • <span className={styles.sha}>{commit.sha}</span> • {commit.subject}
          </span>
        </>
      )
    }
  }
}

function Trailing({ item, isArmed }: { item: PickerItem; isArmed: boolean }) {
  if (isArmed) return <span className={styles.armed}>Switch anyway? ↵</span>
  if (item.kind === 'branch' && item.disabledReason) {
    return <span className={styles.tag}>{item.disabledReason}</span>
  }
  return null
}

export function BranchPickerRow({
  item,
  isActive,
  isArmed,
  onActivate,
  onHover,
}: BranchPickerRowProps) {
  const isDisabled = item.kind === 'branch' && item.disabledReason !== null
  return (
    <li
      id={`branch-option-${item.id}`}
      role="option"
      aria-selected={isActive}
      aria-disabled={isDisabled}
      className={styles.row}
      data-active={isActive}
      onMouseEnter={onHover}
      // mousedown, not click: keep focus in the search field
      onMouseDown={(event) => {
        event.preventDefault()
        if (!isDisabled) onActivate()
      }}
    >
      <span className={styles.main}>
        <Content item={item} />
      </span>
      <Trailing item={item} isArmed={isArmed} />
    </li>
  )
}
