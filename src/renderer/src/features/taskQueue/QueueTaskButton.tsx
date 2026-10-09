import { AGENT_LIST } from '@shared/agents'
import type { ProjectId } from '@shared/project'
import { MAX_TASK_TITLE_LENGTH, type TaskDetail } from '@shared/tasks'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { AgentChoiceMenu } from '@renderer/features/tasks/AgentChoiceMenu'
import { taskStartOptions } from '@renderer/features/tasks/taskStartOptions'
import styles from '@renderer/features/tasks/TaskDetailView.module.css'

/** One agent per queued task; comparing two agents is a "Start agent" choice. */
const QUEUE_OPTIONS = taskStartOptions(AGENT_LIST).filter((option) => option.agents.length === 1)

interface QueueTaskButtonProps {
  readonly projectId: ProjectId
  readonly task: TaskDetail
  readonly disabled: boolean
  /** Runs the change, showing its error on the task page. */
  run(action: Promise<unknown>): void
}

/** "Queue ▾" an agent for the task, to start when a slot frees up; or take it off the queue. */
export function QueueTaskButton({ projectId, task, disabled, run }: QueueTaskButtonProps) {
  const isQueued = useProjectsStore((state) =>
    (state.projects.find((project) => project.id === projectId)?.taskQueue ?? []).some(
      (entry) => entry.number === task.number,
    ),
  )
  const changeTaskQueue = useProjectsStore((state) => state.changeTaskQueue)

  if (isQueued) {
    return (
      <button
        className={styles.button}
        onClick={() => run(changeTaskQueue(projectId, { kind: 'remove', number: task.number }))}
        title="Take this task off the queue"
      >
        Remove from queue
      </button>
    )
  }
  return (
    <AgentChoiceMenu
      label="Queue"
      title="Start an agent on this task when one of the project's agent slots frees up"
      options={QUEUE_OPTIONS}
      disabled={disabled}
      onChoose={([agent]) => {
        if (!agent) return
        const entry = {
          number: task.number,
          key: task.key,
          title: task.title.slice(0, MAX_TASK_TITLE_LENGTH),
          agent,
        }
        run(changeTaskQueue(projectId, { kind: 'add', task: entry }))
      }}
    />
  )
}
