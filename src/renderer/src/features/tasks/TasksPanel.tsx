import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronsRight, Plus, Settings2, X } from 'lucide-react'
import type { Project } from '@shared/project'
import { taskSourceOf, type TaskSource } from '@shared/tasks'
import { isSignedIn, useAuthStore } from '@renderer/features/github/authStore'
import { isLinearConnected, useLinearStore } from '@renderer/features/linear/linearStore'
import { useGitStore } from '@renderer/features/git/gitStore'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { Icon } from '@renderer/lib/Icon'
import { NewTaskForm } from './NewTaskForm'
import { TaskGroups } from './TaskGroups'
import { TaskSourceForm } from './TaskSourceForm'
import { filterTasks, groupTasks } from './taskList'
import { useProjectTasks, useTaskStore } from './taskStore'
import { useTaskAgents } from './useTaskAgents'
import { useTaskUsage } from '@renderer/features/usage/UsageFigure'
import { useProjectOverlaps } from '@renderer/features/overlaps/useOverlaps'
import styles from './Tasks.module.css'

const REFRESH_INTERVAL_MS = 30_000
const SKELETON_CARDS = 3

/**
 * Keeps the project's tasks fresh while its panel is shown: on a timer and on window focus.
 * A new task source (`sourceKey`) starts from an empty list.
 */
function useTaskRefresh(projectId: string, sourceKey: string, isEnabled: boolean) {
  const refresh = useTaskStore((state) => state.refresh)
  const reset = useTaskStore((state) => state.reset)
  const previousSource = useRef(sourceKey)
  useEffect(() => {
    if (previousSource.current === sourceKey) return
    previousSource.current = sourceKey
    reset(projectId)
  }, [projectId, sourceKey, reset])
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
  }, [isEnabled, projectId, sourceKey, refresh])
}

/** Whether the project's task source can be read: signed in to GitHub, or Linear connected. */
function useSourceReady(source: TaskSource): boolean {
  const auth = useAuthStore((state) => state.auth)
  const linear = useLinearStore((state) => state.state)
  const loadLinear = useLinearStore((state) => state.load)
  const isLinear = source.kind === 'linear'
  useEffect(() => {
    if (isLinear && linear === null) void loadLinear()
  }, [isLinear, linear, loadLinear])
  return isLinear ? isLinearConnected(linear) : isSignedIn(auth)
}

/** What the panel says when the project's task source cannot be read yet. */
function NotReady({ source, onChooseLinear }: { source: TaskSource; onChooseLinear(): void }) {
  const signIn = useAuthStore((state) => state.signIn)
  if (source.kind === 'linear') {
    return (
      <div className={styles.empty}>
        <p>This project&apos;s tasks are the {source.teamKey} team&apos;s issues in Linear.</p>
        <button className={styles.primary} onClick={onChooseLinear}>
          Connect Linear
        </button>
      </div>
    )
  }
  return (
    <div className={styles.empty}>
      <p>Tasks are this project&apos;s GitHub Issues. Sign in to see and manage them.</p>
      <button className={styles.primary} onClick={() => void signIn()}>
        Sign in to GitHub
      </button>
      <button onClick={onChooseLinear}>Use Linear instead</button>
    </div>
  )
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

/**
 * A project's tasks (GitHub Issues or a Linear team's issues) as cards, grouped by status; each
 * opens in an editor tab. The header's "Task source" button chooses where they come from.
 */
export function TasksPanel({ project, isActive }: { project: Project; isActive: boolean }) {
  const source = taskSourceOf(project)
  const { tasks, error } = useProjectTasks(project.id)
  const setPanelOpen = useGitStore((state) => state.setPanelOpen)
  const openTask = useEditorStore((state) => state.openTask)
  const agents = useTaskAgents(project.id)
  const usage = useTaskUsage(project.id)
  const overlaps = useProjectOverlaps(project.id)
  const currentTask = useCurrentTask(project.id)
  const [query, setQuery] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  /** The source form is open, starting at this choice. */
  const [choosing, setChoosing] = useState<TaskSource['kind'] | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const isReady = useSourceReady(source)
  const sourceKey = source.kind === 'linear' ? `linear:${source.teamKey}` : source.kind
  useTaskRefresh(project.id, sourceKey, isActive && isReady)

  const groups = useMemo(() => groupTasks(filterTasks(tasks ?? [], query)), [tasks, query])

  const header = (
    <header className={styles.header}>
      <span className={styles.heading}>Tasks</span>
      {isReady && (
        <button onClick={() => setIsCreating(true)} title="New task" aria-label="New task">
          <Icon icon={Plus} />
        </button>
      )}
      <button
        onClick={() => setChoosing((open) => (open ? null : source.kind))}
        title="Task source: GitHub Issues or Linear"
        aria-label="Task source"
        aria-expanded={choosing !== null}
      >
        <Icon icon={Settings2} />
      </button>
      <button
        onClick={() => setPanelOpen(false)}
        title="Hide panel (⇧⌘G)"
        aria-label="Hide Tasks panel"
      >
        <Icon icon={ChevronsRight} />
      </button>
    </header>
  )
  const sourceForm = choosing && (
    <TaskSourceForm project={project} initialKind={choosing} onDone={() => setChoosing(null)} />
  )

  if (!isReady) {
    return (
      <aside className={styles.panel} aria-label="Tasks">
        {header}
        {sourceForm || <NotReady source={source} onChooseLinear={() => setChoosing('linear')} />}
      </aside>
    )
  }

  const message = actionError ?? error
  const hasTasks = (tasks?.length ?? 0) > 0
  return (
    <aside className={styles.panel} aria-label="Tasks">
      {header}
      {sourceForm}
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
            <p>
              No tasks yet. A task is a {source.kind === 'linear' ? 'Linear' : 'GitHub'} issue that
              you can start an agent on.
            </p>
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
          usage={usage}
          overlapsFor={overlaps.forTask}
          currentTask={currentTask}
          onOpen={(task, isPreview) => openTask(project.id, task, isPreview)}
        />
      </div>
    </aside>
  )
}
