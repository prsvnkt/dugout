import { MessageSquare } from 'lucide-react'
import { TASK_STATUS_LABEL, type Task, type TaskPriority } from '@shared/tasks'
import { AGENT_LABEL } from '@shared/terminal'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import { ACTIVITY_LABEL } from '@renderer/features/workspace/paneActivity'
import { formatAge } from '@renderer/lib/formatAge'
import { Icon } from '@renderer/lib/Icon'
import { CheckBadge } from '@renderer/features/checks/CheckBadge'
import { checkLabel } from '@renderer/features/checks/checks'
import { OverlapFlag } from '@renderer/features/overlaps/OverlapFlag'
import { UsageFigure } from '@renderer/features/usage/UsageFigure'
import type { UsageTotals } from '@shared/usage'
import type { LabelledOverlap } from '@renderer/features/overlaps/overlaps'
import { visibleLabels } from './taskList'
import type { TaskAgents } from './useTaskAgents'
import styles from './TaskCard.module.css'

const PRIORITY_LABEL: Readonly<Record<TaskPriority, string>> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

interface TaskCardProps {
  readonly task: Task
  readonly agents: TaskAgents | undefined
  /** Other agents that changed files this task's agents changed too (advisory). */
  readonly overlaps: readonly LabelledOverlap[]
  /** The task is open in the active editor tab. */
  readonly isCurrent: boolean
  /** Tokens its agents used, across all their sessions. */
  readonly usage: UsageTotals | undefined
  /** Click (or Enter) previews the task in a tab; double-click keeps the tab open. */
  onOpen(isPreview: boolean): void
}

function AgentsOnTask({ agents }: { agents: TaskAgents }) {
  return (
    <span className={styles.agents}>
      <span className={styles.agentKinds}>
        {agents.kinds.map((kind) => AGENT_LABEL[kind]).join(' + ')}
      </span>
      {agents.activity && (
        <ActivityIndicator activity={agents.activity} label={ACTIVITY_LABEL[agents.activity]} />
      )}
      {agents.check && <CheckBadge check={agents.check} isCompact />}
    </span>
  )
}

/** One task in the Tasks list: title, when it changed, labels and the agents on it. */
export function TaskCard({ task, agents, overlaps, isCurrent, usage, onOpen }: TaskCardProps) {
  const labels = visibleLabels(task.labels)
  const { priority } = task
  const age = formatAge(task.updatedAt)
  const hasFooter = labels.length > 0 || agents !== undefined || overlaps.length > 0
  return (
    <li>
      <button
        className={styles.card}
        data-status={task.status}
        data-task-card
        aria-current={isCurrent ? 'page' : undefined}
        aria-label={`${task.key} ${task.title}`}
        aria-description={`${TASK_STATUS_LABEL[task.status]}${age ? `, updated ${age}` : ''}${agents?.check ? `, ${checkLabel(agents.check)}` : ''}`}
        title={task.title}
        onClick={() => onOpen(true)}
        onDoubleClick={() => onOpen(false)}
      >
        <span className={styles.title}>{task.title}</span>
        <span className={styles.meta}>
          <span className={styles.number}>{task.key}</span>
          {age && <span>{age}</span>}
          {task.commentCount !== null && task.commentCount > 0 && (
            <span className={styles.comments}>
              <Icon icon={MessageSquare} />
              {task.commentCount}
            </span>
          )}
          {priority && (
            <span className={styles.priority} data-priority={priority}>
              {PRIORITY_LABEL[priority]}
            </span>
          )}
          <UsageFigure totals={usage} label="Tokens on this task" />
        </span>
        {hasFooter && (
          <span className={styles.footer}>
            {labels.map((label) => (
              <span key={label} className={styles.label}>
                {label}
              </span>
            ))}
            <OverlapFlag overlaps={overlaps} className={styles.overlap} />
            {agents && <AgentsOnTask agents={agents} />}
          </span>
        )}
      </button>
    </li>
  )
}
