import type { KeyboardEvent } from 'react'
import { ChevronRight } from 'lucide-react'
import { TASK_STATUS_LABEL, type Task } from '@shared/tasks'
import { Icon } from '@renderer/lib/Icon'
import { TaskCard } from './TaskCard'
import { useTaskGroupsStore } from './taskGroupsStore'
import type { TaskGroup } from './taskList'
import type { LabelledOverlap } from '@renderer/features/overlaps/overlaps'
import type { TaskAgents } from './useTaskAgents'
import styles from './Tasks.module.css'

interface TaskGroupsProps {
  readonly groups: readonly TaskGroup[]
  readonly agents: ReadonlyMap<number, TaskAgents>
  /** Other agents that changed the same files as each task's agents. */
  overlapsFor(taskNumber: number): readonly LabelledOverlap[]
  /** The task open in the active editor tab, if any. */
  readonly currentTask: number | null
  onOpen(task: Task, isPreview: boolean): void
}

/** ↑/↓ move between the cards (and group headings) of the list; Enter opens one. */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[data-task-card], [data-task-group]'),
  ]
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = items[index + (event.key === 'ArrowDown' ? 1 : -1)]
  if (index === -1 || !next) return
  event.preventDefault()
  next.focus()
}

/** The tasks by status, in groups that collapse (remembered; Done starts collapsed). */
export function TaskGroups(props: TaskGroupsProps) {
  const { groups, agents, overlapsFor, currentTask, onOpen } = props
  const isOpen = useTaskGroupsStore((state) => state.isOpen)
  const toggle = useTaskGroupsStore((state) => state.toggle)
  return (
    <div className={styles.groups} onKeyDown={moveFocus}>
      {groups.map((group) => {
        const label = TASK_STATUS_LABEL[group.status]
        const open = isOpen[group.status]
        return (
          <section key={group.status} aria-label={label}>
            <h4 className={styles.group}>
              <button
                className={styles.groupToggle}
                data-task-group
                aria-expanded={open}
                onClick={() => toggle(group.status)}
              >
                <Icon icon={ChevronRight} className={styles.chevron} />
                {label}
                <span className={styles.count}>{group.tasks.length}</span>
              </button>
            </h4>
            {open && (
              <ul className={styles.list}>
                {group.tasks.map((task) => (
                  <TaskCard
                    key={task.number}
                    task={task}
                    agents={agents.get(task.number)}
                    overlaps={overlapsFor(task.number)}
                    isCurrent={task.number === currentTask}
                    onOpen={(isPreview) => onOpen(task, isPreview)}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
