import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { Project } from '@shared/project'
import { TASK_STATUS_LABEL, type Task, type TaskStatus } from '@shared/tasks'
import { isSignedIn, useAuthStore } from '@renderer/features/github/authStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { ActivityIndicator } from '@renderer/features/terminal/ActivityIndicator'
import {
  ACTIVITY_LABEL,
  projectAttention,
  type PaneActivity,
} from '@renderer/features/workspace/paneActivity'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { TaskDetailView } from './TaskDetailView'
import { useProjectTasks, useTaskStore } from './taskStore'
import styles from './Tasks.module.css'

const REFRESH_INTERVAL_MS = 30_000
const GROUP_ORDER: readonly TaskStatus[] = ['in-progress', 'in-review', 'todo', 'done']
const DONE_SHOWN = 10

/** The most urgent status of the agents working on each task. */
function useAgentActivityByTask(projectId: string): ReadonlyMap<number, PaneActivity | null> {
  const panes = useWorkspaceStore((state) => state.layouts[projectId]?.panes)
  const activities = useWorkspaceStore((state) => state.activities)
  return useMemo(() => {
    const byTask = new Map<number, PaneActivity[]>()
    for (const pane of panes ?? []) {
      if (!pane.task) continue
      const activity = activities[pane.id]
      byTask.set(pane.task.number, [
        ...(byTask.get(pane.task.number) ?? []),
        ...(activity ? [activity] : []),
      ])
    }
    return new Map(
      [...byTask].map(([number, list]) => [number, projectAttention(list) ?? list[0] ?? null]),
    )
  }, [panes, activities])
}

function NewTaskForm({
  projectId,
  onDone,
  onError,
}: {
  projectId: string
  onDone(): void
  onError(message: string): void
}) {
  const create = useTaskStore((state) => state.create)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const submit = (event: FormEvent) => {
    event.preventDefault()
    create({ projectId, title, body })
      .then(onDone)
      .catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)))
  }
  return (
    <form className={styles.newTask} onSubmit={submit} aria-label="New task">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Title"
        aria-label="Title"
        autoFocus
      />
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder="Description (optional)"
        aria-label="Description"
        rows={4}
      />
      <div className={styles.formActions}>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" className={styles.primary} disabled={!title.trim()}>
          Create task
        </button>
      </div>
    </form>
  )
}

function TaskRow({
  task,
  agent,
  onOpen,
}: {
  task: Task
  agent: PaneActivity | null | undefined
  onOpen(): void
}) {
  return (
    <li>
      <button className={styles.row} onClick={onOpen} aria-label={`#${task.number} ${task.title}`}>
        <span className={styles.number}>#{task.number}</span>
        <span className={styles.title}>{task.title}</span>
        {agent && (
          <ActivityIndicator
            activity={agent}
            label={ACTIVITY_LABEL[agent]}
            className={styles.agent}
          />
        )}
      </button>
    </li>
  )
}

/** A project's GitHub Issues as tasks, grouped by status, with agents started from them. */
export function TasksPanel({ project, isActive }: { project: Project; isActive: boolean }) {
  const auth = useAuthStore((state) => state.auth)
  const signIn = useAuthStore((state) => state.signIn)
  const { tasks, error, selected, detail, isBusy } = useProjectTasks(project.id)
  const { refresh, select } = useTaskStore()
  const setPanelOpen = useGitStore((state) => state.setPanelOpen)
  const agents = useAgentActivityByTask(project.id)
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const signedIn = isSignedIn(auth)

  useEffect(() => {
    if (!isActive || !signedIn) return
    void refresh(project.id)
    const timer = window.setInterval(() => void refresh(project.id), REFRESH_INTERVAL_MS)
    const onFocus = () => void refresh(project.id)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [isActive, signedIn, project.id, refresh])

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const visible = (tasks ?? []).filter(
      (task) =>
        !needle ||
        task.title.toLowerCase().includes(needle) ||
        String(task.number) === needle.replace('#', ''),
    )
    return GROUP_ORDER.map((status) => ({
      status,
      tasks: visible
        .filter((task) => task.status === status)
        .slice(0, status === 'done' ? DONE_SHOWN : undefined),
    })).filter((group) => group.tasks.length > 0)
  }, [tasks, query])

  const header = (
    <header className={styles.header}>
      <span className={styles.heading}>Tasks</span>
      {signedIn && (
        <button onClick={() => setIsCreating(true)} title="New task" aria-label="New task">
          +
        </button>
      )}
      <button
        onClick={() => setPanelOpen(false)}
        title="Hide panel (⇧⌘G)"
        aria-label="Hide Tasks panel"
      >
        »
      </button>
    </header>
  )

  if (!signedIn) {
    return (
      <aside className={styles.panel} aria-label="Tasks">
        {header}
        <div className={styles.empty}>
          <p>Tasks are this project&apos;s GitHub Issues. Sign in to see and manage them.</p>
          <button className={styles.primary} onClick={() => void signIn()}>
            Sign in to GitHub
          </button>
        </div>
      </aside>
    )
  }

  const message = actionError ?? error
  return (
    <aside className={styles.panel} aria-label="Tasks">
      {header}
      {message && (
        <p className={styles.error} role="alert">
          {message}
          {actionError && (
            <button onClick={() => setActionError(null)} aria-label="Dismiss">
              ×
            </button>
          )}
        </p>
      )}
      {isCreating && (
        <NewTaskForm
          projectId={project.id}
          onDone={() => setIsCreating(false)}
          onError={setActionError}
        />
      )}
      {selected !== null && detail ? (
        <TaskDetailView
          projectId={project.id}
          task={detail}
          isBusy={isBusy}
          hasAgent={agents.has(detail.number)}
          onError={setActionError}
        />
      ) : (
        <>
          <input
            className={styles.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks"
            aria-label="Search tasks"
          />
          <div className={styles.scroll}>
            {tasks === null && !error && <p className={styles.muted}>Loading tasks…</p>}
            {tasks?.length === 0 && (
              <p className={styles.muted}>No tasks yet. Create one with +.</p>
            )}
            {groups.map((group) => (
              <section key={group.status} aria-label={TASK_STATUS_LABEL[group.status]}>
                <h4 className={styles.group}>
                  {TASK_STATUS_LABEL[group.status]}{' '}
                  <span className={styles.count}>{group.tasks.length}</span>
                </h4>
                <ul className={styles.list}>
                  {group.tasks.map((task) => (
                    <TaskRow
                      key={task.number}
                      task={task}
                      agent={agents.get(task.number)}
                      onOpen={() => void select(project.id, task.number)}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}
