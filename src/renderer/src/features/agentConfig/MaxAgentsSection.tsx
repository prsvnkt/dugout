import { useId, useState } from 'react'
import type { Project } from '@shared/project'
import { MAX_MAX_AGENTS, MIN_MAX_AGENTS, maxAgentsOf } from '@shared/taskQueue'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import styles from './AgentSettings.module.css'

const LIMIT_CHOICES = Array.from(
  { length: MAX_MAX_AGENTS - MIN_MAX_AGENTS + 1 },
  (_, index) => MIN_MAX_AGENTS + index,
)

/** The task queue's limit (decision 047): how many agents it lets run at once. Saves on change. */
export function MaxAgentsSection({ project }: { project: Project }) {
  const setMaxAgents = useProjectsStore((state) => state.setMaxAgents)
  const [error, setError] = useState<string | null>(null)
  const selectId = useId()

  const save = (maxAgents: number) => {
    setError(null)
    setMaxAgents(project.id, maxAgents).catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : String(caught)),
    )
  }

  return (
    <div className={styles.form}>
      <div className={styles.field}>
        <label htmlFor={selectId}>Max agents at once</label>
        <select
          id={selectId}
          className={styles.narrow}
          value={maxAgentsOf(project)}
          onChange={(event) => save(Number(event.target.value))}
        >
          {LIMIT_CHOICES.map((choice) => (
            <option key={choice} value={choice}>
              {choice}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
