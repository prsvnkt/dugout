import { useEffect, useState } from 'react'
import type { Project } from '@shared/project'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useProjectWorktrees, useWorktreeStore } from './worktreeStore'
import styles from './Worktrees.module.css'

const CONFIRM_WINDOW_MS = 3_000
const MAIN_CHECKOUT = ''

/** Chooses which checkout the git panel reviews, and removes worktrees. */
export function CheckoutPicker({ project }: { project: Project }) {
  const worktrees = useProjectWorktrees(project.id)
  const selected = useWorkspaceStore((state) => state.gitCheckouts[project.id] ?? null)
  const selectCheckout = useWorkspaceStore((state) => state.selectCheckout)
  const remove = useWorktreeStore((state) => state.remove)
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

  return (
    <div className={styles.picker}>
      <select
        className={styles.select}
        value={selected ?? MAIN_CHECKOUT}
        onChange={(event) => selectCheckout(project.id, event.target.value || null)}
        aria-label="Checkout to review"
      >
        <option value={MAIN_CHECKOUT}>Main checkout</option>
        {worktrees.map((worktree) => (
          <option key={worktree.path} value={worktree.path}>
            Worktree · {worktree.branch ?? worktree.name}
          </option>
        ))}
      </select>
      {selected && (
        <button className={styles.remove} data-armed={isConfirming} onClick={onRemove}>
          {isConfirming ? 'Click again to remove' : 'Remove worktree'}
        </button>
      )}
    </div>
  )
}
