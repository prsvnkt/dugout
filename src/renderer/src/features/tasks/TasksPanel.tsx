import { useEffect, useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronsRight, Plus, X } from 'lucide-react'
import type { Project } from '@shared/project'
import { isSignedIn, useAuthStore } from '@renderer/features/github/authStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { Icon } from '@renderer/lib/Icon'
import { NewTaskForm } from './NewTaskForm'
import { TaskGroups } from './TaskGroups'
import { filterTasks, groupTasks } from './taskList'
import { useProjectTasks, useTaskStore } from './taskStore'
import { useTaskAgents } from './useTaskAgents'
import { useProjectOverlaps } from '@renderer/features/overlaps/useOverlaps'
import styles from './Tasks.module.css'

const REFRESH_INTERVAL_MS = 30_000
const SKELETON_CARDS = 3

/** Keeps the project's tasks fresh while its panel is shown: on a timer and on window focus. */
function useTaskRefresh(projectId: string, isEnabled: boolean) {
  const refresh = useTaskStore((state) => state.refresh)
  useEffect(() => {
    if (!isEnabled) return
    void refresh(projectId)
    const timer = window.setInterval(() => void refresh(projectId), REFRESH_INTERVAL_MS)
    const onFocus = () => void refresh(projectId)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [isEnabled, projectId, refresh])
}

/** The task open in the project's active editor tab, if any. */
function useCurrentTask(projectId: string): number | null {
  const { tabs, activeTabId } = useProjectTabs(projectId)
  return tabs.find((tab) => tab.id === activeTabId)?.taskNumber ?? null
}

function LoadingCards() {
  return (
    <div className={styles.skeletons} role="status" aria-label="Loading tasks…">
      {Array.from({ length: SKELETON_CARDS }, (_, index) => (
        <span key={index} className={styles.skeleton} aria-hidden />
      ))}
    </div>
  )
}

/** ↓ from the search box moves into the list. */
function focusFirstCard(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== 'ArrowDown') return
  const panel = event.currentTarget.closest('aside')
  const first = panel?.querySelector<HTMLElement>('[data-task-card], [data-task-group]')
  if (!first) return
  event.preventDefault()
  first.focus()
}

/** A project's GitHub Issues as task cards, grouped by status; each opens in an editor tab. */
export function TasksPanel({ project, isActive }: { project: Project; isActive: boolean }) {
  const auth = useAuthStore((state) => state.auth)
  const signIn = useAuthStore((state) => state.signIn)
  const { tasks, error } = useProjectTasks(project.id)
  const setPanelOpen = useGitStore((state) => state.setPanelOpen)
  const openTask = useEditorStore((state) => state.openTask)
  const agents = useTaskAgents(project.id)
  const overlaps = useProjectOverlaps(project.id)
  const currentTask = useCurrentTask(project.id)
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const signedIn = isSignedIn(auth)
  useTaskRefresh(project.id, isActive && signedIn)

  const groups = useMemo(() => groupTasks(filterTasks(tasks ?? [], query)), [tasks, query])

  const header = (
    <header className={styles.header}>
      <span className={styles.heading}>Tasks</span>
      {signedIn && (
        <button onClick={() => setIsCreating(true)} title="New task" aria-label="New task">
          <Icon icon={Plus} />
        </button>
      )}
      <button
        onClick={() => setPanelOpen(false)}
        title="Hide panel (⇧⌘G)"
        aria-label="Hide Tasks panel"
      >
        <Icon icon={ChevronsRight} />
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
  const hasTasks = (tasks?.length ?? 0) > 0
  return (
    <aside className={styles.panel} aria-label="Tasks">
      {header}
      {message && (
        <p className={styles.error} role="alert">
          {message}
          {actionError && (
            <button onClick={() => setActionError(null)} aria-label="Dismiss" title="Dismiss">
              <Icon icon={X} />
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
      {hasTasks && (
        <input
          className={`${styles.input} ${styles.search}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={focusFirstCard}
          placeholder="Search tasks"
          aria-label="Search tasks"
        />
      )}
      <div className={styles.scroll}>
        {tasks === null && !error && <LoadingCards />}
        {tasks?.length === 0 && !isCreating && (
          <div className={styles.empty}>
            <p>No tasks yet. A task is a GitHub issue that you can start an agent on.</p>
            <button className={styles.primary} onClick={() => setIsCreating(true)}>
              Create a task
            </button>
          </div>
        )}
        {hasTasks && groups.length === 0 && (
          <p className={styles.muted}>No tasks match “{query.trim()}”.</p>
        )}
        <TaskGroups
          groups={groups}
          agents={agents}
          overlapsFor={overlaps.forTask}
          currentTask={currentTask}
          onOpen={(task, isPreview) => openTask(project.id, task.number, task.title, isPreview)}
        />
      </div>
    </aside>
  )
}
