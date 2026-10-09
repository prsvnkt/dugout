import { ArrowDown, ArrowUp, X } from 'lucide-react'
import { AGENT_LABEL } from '@shared/agents'
import type { Project } from '@shared/project'
import { maxAgentsOf, type QueuedTask, type TaskQueueChange } from '@shared/taskQueue'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { Icon } from '@renderer/lib/Icon'
import { useTaskQueueStore } from './taskQueueStore'
import { useBusySlots } from './useTaskQueueRunner'
import styles from './TaskQueue.module.css'

interface EntryProps {
  readonly task: QueuedTask
  readonly position: number
  readonly isFirst: boolean
  readonly isLast: boolean
  change(change: TaskQueueChange): void
}

function QueueEntry({ task, position, isFirst, isLast, change }: EntryProps) {
  const move = (offset: -1 | 1) => change({ kind: 'move', number: task.number, offset })
  return (
    <li className={styles.entry} aria-label={`${task.key} ${task.title}`}>
      <span className={styles.position}>{position}</span>
      <span className={styles.task}>
        <span className={styles.taskTitle} title={task.title}>
          {task.title}
        </span>
        <span className={styles.meta}>
          {task.key} · {AGENT_LABEL[task.agent]}
        </span>
      </span>
      <button
        onClick={() => move(-1)}
        disabled={isFirst}
        aria-label={`Move ${task.key} up`}
        title="Move up"
      >
        <Icon icon={ArrowUp} />
      </button>
      <button
        onClick={() => move(1)}
        disabled={isLast}
        aria-label={`Move ${task.key} down`}
        title="Move down"
      >
        <Icon icon={ArrowDown} />
      </button>
      <button
        onClick={() => change({ kind: 'remove', number: task.number })}
        aria-label={`Remove ${task.key} from queue`}
        title="Remove from queue"
      >
        <Icon icon={X} />
      </button>
    </li>
  )
}

/**
 * The project's queued tasks (decision 047), first to start first, and how many of its agent
 * slots are taken (the limit is set in Agent settings). Shown at the top of the Tasks panel
 * while anything is queued.
 */
export function TaskQueue({ project }: { project: Project }) {
  const queue = project.taskQueue ?? []
  const busy = useBusySlots(project.id)
  const error = useTaskQueueStore((state) => state.errors[project.id] ?? null)
  const setError = useTaskQueueStore((state) => state.setError)
  const changeTaskQueue = useProjectsStore((state) => state.changeTaskQueue)

  const report = (action: Promise<void>) => {
    setError(project.id, null)
    action.catch((cause: unknown) =>
      setError(project.id, cause instanceof Error ? cause.message : String(cause)),
    )
  }
  if (queue.length === 0 && !error) return null

  return (
    <section className={styles.queue} aria-label="Queue">
      <div className={styles.header}>
        <span className={styles.title}>Queue</span>
        <span className={styles.slots} role="status">
          {busy} of {maxAgentsOf(project)} agents busy
        </span>
      </div>
      {queue.length > 0 && (
        <ol className={styles.list}>
          {queue.map((task, index) => (
            <QueueEntry
              key={task.number}
              task={task}
              position={index + 1}
              isFirst={index === 0}
              isLast={index === queue.length - 1}
              change={(change) => report(changeTaskQueue(project.id, change))}
            />
          ))}
        </ol>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
          <button onClick={() => setError(project.id, null)} aria-label="Dismiss" title="Dismiss">
            <Icon icon={X} />
          </button>
        </p>
      )}
    </section>
  )
}
