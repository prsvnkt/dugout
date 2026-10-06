import { useEffect, useState } from 'react'
import type { GitStatus } from '@shared/git'
import type { Project } from '@shared/project'
import type { Worktree } from '@shared/worktree'
import { useCheckoutGit } from '@renderer/features/git/gitStore'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useProjectWorktrees, useWorktreeStore } from './worktreeStore'
import styles from './Worktrees.module.css'

const CONFIRM_WINDOW_MS = 3_000
const MAIN_CHECKOUT = ''
/** Up to this many checkouts (main included) show as a segmented control; more use a select. */
const MAX_SEGMENTS = 3

/** "⎇ main ↑2" for the main checkout, from its last known status. */
function mainLabel(status: GitStatus | null): string {
  if (!status) return 'Main checkout'
  const ahead = status.ahead > 0 ? ` ↑${status.ahead}` : ''
  return `⎇ ${status.branch ?? 'detached'}${ahead}`
}

function worktreeLabel(worktree: Worktree): string {
  return worktree.branch ?? worktree.name
}

interface ChoiceProps {
  readonly selected: string
  readonly mainText: string
  readonly worktrees: readonly Worktree[]
  onSelect(value: string): void
}

function Segments({ selected, mainText, worktrees, onSelect }: ChoiceProps) {
  const options = [
    { value: MAIN_CHECKOUT, label: mainText, title: 'Main checkout' },
    ...worktrees.map((worktree) => ({
      value: worktree.path,
      label: worktreeLabel(worktree),
      title: `Worktree · ${worktreeLabel(worktree)}`,
    })),
  ]
  return (
    <div className={styles.segments} role="radiogroup" aria-label="Checkout to review">
      {options.map((option) => (
        <button
          key={option.value}
          role="radio"
          aria-checked={option.value === selected}
          aria-label={option.title}
          className={styles.segment}
          title={option.title}
          onClick={() => onSelect(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function Dropdown({ selected, mainText, worktrees, onSelect }: ChoiceProps) {
  return (
    <select
      className={styles.select}
      value={selected}
      onChange={(event) => onSelect(event.target.value)}
      aria-label="Checkout to review"
    >
      <option value={MAIN_CHECKOUT}>{mainText}</option>
      {worktrees.map((worktree) => (
        <option key={worktree.path} value={worktree.path}>
          Worktree · {worktreeLabel(worktree)}
        </option>
      ))}
    </select>
  )
}

/** Chooses which checkout the git panel reviews, and removes worktrees. */
export function CheckoutPicker({ project }: { project: Project }) {
  const worktrees = useProjectWorktrees(project.id)
  const selected = useWorkspaceStore((state) => state.gitCheckouts[project.id] ?? null)
  const selectCheckout = useWorkspaceStore((state) => state.selectCheckout)
  const remove = useWorktreeStore((state) => state.remove)
  const mainStatus = useCheckoutGit({ projectId: project.id }).status
  const [isConfirming, setIsConfirming] = useState(false)

  useEffect(() => {
    if (!isConfirming) return
    const timer = window.setTimeout(() => setIsConfirming(false), CONFIRM_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [isConfirming])

  if (worktrees.length === 0) return null

  const onRemove = () => {
    if (!selected) return
    if (!isConfirming) return setIsConfirming(true)
    setIsConfirming(false)
    void remove(project.id, selected)
  }
  const choice: ChoiceProps = {
    selected: selected ?? MAIN_CHECKOUT,
    mainText: mainLabel(mainStatus),
    worktrees,
    onSelect: (value) => selectCheckout(project.id, value || null),
  }

  return (
    <div className={styles.picker}>
      {worktrees.length + 1 <= MAX_SEGMENTS ? <Segments {...choice} /> : <Dropdown {...choice} />}
      {selected && (
        <button className={styles.remove} data-armed={isConfirming} onClick={onRemove}>
          {isConfirming ? 'Click again to remove' : 'Remove worktree'}
        </button>
      )}
    </div>
  )
}
