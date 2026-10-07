import { useEffect, useState } from 'react'
import type { Project } from '@shared/project'
import { AGENT_LABEL } from '@shared/terminal'
import { isSignedIn, useAuthStore } from '@renderer/features/github/authStore'
import { useProjectTasks, useTaskStore } from '@renderer/features/tasks/taskStore'
import { useDefaultAgentStore } from './defaultAgentStore'
import styles from './StartScreen.module.css'

const SHOWN_TASKS = 3

interface OpenTaskListProps {
  readonly project: Project
  readonly isActive: boolean
}

/** The next few To do tasks (GitHub Issues), each startable with the default agent. */
export function OpenTaskList({ project, isActive }: OpenTaskListProps) {
  const signedIn = useAuthStore((state) => isSignedIn(state.auth))
  const { tasks, isBusy } = useProjectTasks(project.id)
  const refresh = useTaskStore((state) => state.refresh)
  const startAgent = useTaskStore((state) => state.startAgent)
  const defaultAgent = useDefaultAgentStore((state) => state.defaultAgent)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isActive && signedIn) void refresh(project.id)
  }, [isActive, signedIn, project.id, refresh])

  const todo = (tasks ?? []).filter((task) => task.status === 'todo').slice(0, SHOWN_TASKS)
  if (!signedIn || todo.length === 0) return null

  const start = (number: number) => {
    setError(null)
    startAgent(project.id, number, [defaultAgent]).catch((cause: unknown) =>
      setError(cause instanceof Error ? cause.message : 'Could not start the agent.'),
    )
  }

  return (
    <section className={styles.section} aria-label="Open tasks">
      <h2 className={styles.sectionHeading}>Open tasks</h2>
      <ul className={styles.list}>
        {todo.map((task) => (
          <li key={task.number}>
            <button className={styles.row} disabled={isBusy} onClick={() => start(task.number)}>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{task.title}</span>
                <span className={styles.rowMeta}>#{task.number} · in a new worktree</span>
              </span>
              <span className={styles.rowAction}>Start with {AGENT_LABEL[defaultAgent]}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
