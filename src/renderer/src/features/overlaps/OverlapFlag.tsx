import { TriangleAlert } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { overlapDetail, overlapSummary, type LabelledOverlap } from './overlaps'
import styles from './OverlapFlag.module.css'

interface OverlapFlagProps {
  readonly overlaps: readonly LabelledOverlap[]
  readonly className?: string | undefined
}

/**
 * Advisory warning that other agents changed some of the same files: "also changed by #12".
 * The tooltip lists the files. Renders nothing when there is no overlap.
 */
export function OverlapFlag({ overlaps, className }: OverlapFlagProps) {
  if (overlaps.length === 0) return null
  const summary = overlapSummary(overlaps)
  return (
    <span
      className={className ? `${styles.flag} ${className}` : styles.flag}
      title={overlapDetail(overlaps)}
      role="note"
      aria-label={`Overlapping changes: ${summary}`}
    >
      <Icon icon={TriangleAlert} />
      <span className={styles.text}>{summary}</span>
    </span>
  )
}
