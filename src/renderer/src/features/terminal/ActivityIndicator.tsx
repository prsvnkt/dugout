import type { PaneActivity } from '@renderer/features/workspace/paneActivity'
import styles from './ActivityIndicator.module.css'

interface ActivityIndicatorProps {
  readonly activity: PaneActivity
  readonly label: string
  readonly className?: string | undefined
}

/** A status dot plus text label, so status never relies on colour alone. */
export function ActivityIndicator({ activity, label, className }: ActivityIndicatorProps) {
  return (
    <span className={`${styles.indicator} ${className ?? ''}`} data-activity={activity}>
      <span className={styles.dot} aria-hidden />
      {label}
    </span>
  )
}
