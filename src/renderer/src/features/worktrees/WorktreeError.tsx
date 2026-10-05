import { useWorktreeStore } from './worktreeStore'
import styles from './Worktrees.module.css'

/** Shows why creating or removing a worktree failed, until dismissed. */
export function WorktreeError({ projectId }: { projectId: string }) {
  const error = useWorktreeStore((state) => state.errors[projectId] ?? null)
  const dismiss = useWorktreeStore((state) => state.dismissError)
  if (!error) return null
  return (
    <div className={styles.error} role="alert">
      <span>{error}</span>
      <button onClick={() => dismiss(projectId)} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
