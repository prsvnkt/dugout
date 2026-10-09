import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { AGENT_LIST } from '@shared/agents'
import type { ProjectId } from '@shared/project'
import { TASK_STATUS_LABEL, TASK_STATUSES, type TaskDetail, type TaskStatus } from '@shared/tasks'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { taskTabId } from '@renderer/features/editor/tabs'
import { dugout } from '@renderer/lib/dugout'
import { formatAge } from '@renderer/lib/formatAge'
import { Icon } from '@renderer/lib/Icon'
import { OverlapFlag } from '@renderer/features/overlaps/OverlapFlag'
import { useProjectOverlaps } from '@renderer/features/overlaps/useOverlaps'
import { Markdown } from './markdown/Markdown'
import { CheckBadge } from '@renderer/features/checks/CheckBadge'
import { QueueTaskButton } from '@renderer/features/taskQueue/QueueTaskButton'
import { AgentChoiceMenu } from './AgentChoiceMenu'
import { TaskComments } from './TaskComments'
import { visibleLabels } from './taskList'
import { useProjectTasks, useTaskStore } from './taskStore'
import { useTaskAgents } from './useTaskAgents'
import { useTaskSource } from './useTaskSource'
import { TaskTimelines } from '@renderer/features/timeline/TaskTimelines'
import { UsageFigure, useTaskUsage } from '@renderer/features/usage/UsageFigure'
import { taskStartOptions } from './taskStartOptions'
import styles from './TaskDetailView.module.css'

const START_OPTIONS = taskStartOptions(AGENT_LIST)

interface TaskDetailViewProps {
  readonly projectId: ProjectId
  readonly number: number
  /** "#12" or "ENG-12", shown before the task has loaded. */
  readonly taskKey: string
}

/** Loads the task while its tab is shown and keeps it fresh (refreshes reload viewed tasks). */
function useViewedTask(projectId: ProjectId, number: number) {
  const view = useTaskStore((state) => state.view)
  const unview = useTaskStore((state) => state.unview)
  useEffect(() => {
    void view(projectId, number)
    return () => unview(projectId, number)
  }, [projectId, number, view, unview])
  const { details, detailErrors, isBusy } = useProjectTasks(projectId)
  return { task: details[number] ?? null, loadError: detailErrors[number] ?? null, isBusy }
}

function Byline({ task }: { task: TaskDetail }) {
  const labels = visibleLabels(task.labels)
  return (
    <div className={styles.byline}>
      <span>
        Opened by <strong>{task.author}</strong>
      </span>
      <span>Updated {formatAge(task.updatedAt)}</span>
      {labels.map((label) => (
        <span key={label} className={styles.label}>
          {label}
        </span>
      ))}
    </div>
  )
}

/** One task, in an editor tab: description, status, comments, and the agents to start on it. */
export function TaskDetailView({ projectId, number, taskKey }: TaskDetailViewProps) {
  const { task, loadError, isBusy } = useViewedTask(projectId, number)
  const { update, comment, startAgent } = useTaskStore()
  const openCompare = useEditorStore((state) => state.openCompare)
  const pin = useEditorStore((state) => state.pin)
  const agents = useTaskAgents(projectId).get(number)
  const overlaps = useProjectOverlaps(projectId).forTask(number)
  const usage = useTaskUsage(projectId).get(number)
  const [actionError, setActionError] = useState<string | null>(null)
  const source = useTaskSource(projectId)

  if (!task) {
    return (
      <section className={styles.detail} aria-label={`Task ${taskKey}`}>
        <p className={styles.notice} role={loadError ? 'alert' : 'status'}>
          {loadError ?? 'Loading task…'}
        </p>
      </section>
    )
  }

  /** Acting on a task keeps its tab open (pins a preview tab), as editing a file does. */
  const run = (action: Promise<unknown>): Promise<boolean> => {
    pin(projectId, taskTabId(number))
    setActionError(null)
    return action.then(
      () => true,
      (error: unknown) => {
        setActionError(error instanceof Error ? error.message : String(error))
        return false
      },
    )
  }
  const [first, second] = agents?.compareSides ?? []
  const compare = () => {
    if (!first || !second) return
    openCompare(projectId, `task-${number}`, {
      title: `Compare ${task.key}`,
      sides: [first, second],
      taskNumber: number,
    })
  }

  return (
    <section className={styles.detail} aria-label={`Task ${task.key}`}>
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.title}>
            {task.title} <span className={styles.number}>{task.key}</span>
          </h1>
          <Byline task={task} />
        </header>

        <div className={styles.actions}>
          <label className={styles.statusSelect}>
            <span className={styles.statusDot} data-status={task.status} aria-hidden />
            <select
              aria-label="Status"
              value={task.status}
              disabled={isBusy}
              onChange={(event) =>
                void run(update({ projectId, number, status: event.target.value as TaskStatus }))
              }
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {TASK_STATUS_LABEL[status]}
                </option>
              ))}
            </select>
          </label>
          <AgentChoiceMenu
            label={agents ? 'Start another agent' : 'Start agent'}
            title="Start an agent in a new worktree with this task as its first prompt"
            options={START_OPTIONS}
            isPrimary
            disabled={isBusy || task.status === 'done'}
            onChoose={(kinds) => void run(startAgent(projectId, number, kinds))}
          />
          <QueueTaskButton
            projectId={projectId}
            task={task}
            disabled={isBusy || task.status === 'done'}
            run={(action) => void run(action)}
          />
          {second && (
            <button
              className={styles.button}
              onClick={compare}
              title="Compare what the agents on this task changed"
            >
              Compare
            </button>
          )}
          <TaskTimelines
            projectId={projectId}
            taskNumber={number}
            taskKey={task.key}
            className={styles.button}
          />
          <button
            className={styles.button}
            onClick={() => void run(dugout.tasks.openInBrowser(projectId, number))}
          >
            {source.kind === 'linear' ? 'Open in Linear' : 'Open on GitHub'}
          </button>
          {agents?.check && <CheckBadge check={agents.check} />}
        </div>

        <OverlapFlag overlaps={overlaps} />
        <UsageFigure totals={usage} label="Tokens on this task" />

        {actionError && (
          <p className={styles.error} role="alert">
            {actionError}
            <button onClick={() => setActionError(null)} aria-label="Dismiss" title="Dismiss">
              <Icon icon={X} />
            </button>
          </p>
        )}

        <article className={styles.body} aria-label="Description">
          {task.body.trim() ? (
            <Markdown text={task.body} />
          ) : (
            <p className={styles.muted}>No description.</p>
          )}
        </article>

        <TaskComments
          comments={task.comments}
          isBusy={isBusy}
          onComment={(body) => run(comment(projectId, number, body))}
        />
      </div>
    </section>
  )
}
