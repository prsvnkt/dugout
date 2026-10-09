import { useMemo } from 'react'
import type { CompareSide } from '@shared/compare'
import type { ProjectId } from '@shared/project'
import type { UsageTotals } from '@shared/usage'
import { hasUsage, tokensLabel, usageBreakdown } from './usageFormat'
import { useProjectUsage } from './usageStore'
import styles from './Usage.module.css'

/** "48.2k tokens", with the breakdown and cost estimate in its tooltip; nothing without usage. */
export function UsageFigure({ totals, label }: { totals: UsageTotals | undefined; label: string }) {
  if (!hasUsage(totals)) return null
  const text = tokensLabel(totals)
  return (
    <span
      className={styles.figure}
      title={`${label}: ${text}\n${usageBreakdown(totals)}`}
      aria-label={`${label}: ${text}`}
    >
      {text}
    </span>
  )
}

/** Compare's line for a task: each side's agent and its tokens on the task. */
export function CompareUsage(props: {
  projectId: ProjectId
  taskNumber: number
  sides: readonly CompareSide[]
}) {
  const { projectId, taskNumber, sides } = props
  const usage = useProjectUsage(projectId)
  const byAgent = usage?.byTask.find((entry) => entry.task === taskNumber)?.byAgent
  const parts = sides.flatMap((side) => {
    const totals = side.agent ? byAgent?.[side.agent] : undefined
    return hasUsage(totals) ? [`${side.label} ${tokensLabel(totals)}`] : []
  })
  if (parts.length === 0) return null
  return (
    <p
      className={`${styles.figure} ${styles.compare}`}
      title="Across all sessions on this task; cache reads not included"
    >
      {parts.join(' · ')}
    </p>
  )
}

/** Every task's total across all its sessions, by task number. */
export function useTaskUsage(projectId: ProjectId): ReadonlyMap<number, UsageTotals> {
  const usage = useProjectUsage(projectId)
  return useMemo(
    () => new Map((usage?.byTask ?? []).map(({ task, totals }) => [task, totals])),
    [usage],
  )
}
