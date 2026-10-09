import { useEffect, useState } from 'react'
import type { Project } from '@shared/project'
import { taskSourceOf, type TaskSource } from '@shared/tasks'
import { useLinearStore } from '@renderer/features/linear/linearStore'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { LinearConnect } from './LinearConnect'
import styles from './TaskSource.module.css'
import tasksStyles from './Tasks.module.css'

type SourceKind = TaskSource['kind']

const SOURCE_LABEL: Readonly<Record<SourceKind, string>> = {
  github: 'GitHub Issues',
  linear: 'Linear',
}

interface TaskSourceFormProps {
  readonly project: Project
  /** The choice selected when the form opens. */
  readonly initialKind: SourceKind
  /** Called after saving, and on Cancel. */
  onDone(): void
}

/** Where the project's tasks live: its GitHub repo's issues, or a Linear team's issues. */
export function TaskSourceForm({ project, initialKind, onDone }: TaskSourceFormProps) {
  const current = taskSourceOf(project)
  const linearState = useLinearStore((state) => state.state)
  const loadLinear = useLinearStore((state) => state.load)
  const setTaskSource = useProjectsStore((state) => state.setTaskSource)
  const [kind, setKind] = useState<SourceKind>(initialKind)
  const [teamKey, setTeamKey] = useState(current.kind === 'linear' ? current.teamKey : '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (kind === 'linear' && linearState === null) void loadLinear()
  }, [kind, linearState, loadLinear])

  const next: TaskSource | null =
    kind === 'github'
      ? { kind: 'github' }
      : linearState?.status === 'connected' && teamKey
        ? { kind: 'linear', teamKey }
        : null

  const save = () => {
    if (!next) return
    setError(null)
    setTaskSource(project.id, next)
      .then(onDone)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
  }

  return (
    <section className={styles.form} aria-label="Task source">
      <fieldset className={styles.choices}>
        <legend className={styles.legend}>Tasks come from</legend>
        {(Object.keys(SOURCE_LABEL) as SourceKind[]).map((option) => (
          <label key={option} className={styles.choice}>
            <input
              type="radio"
              name={`task-source-${project.id}`}
              checked={kind === option}
              onChange={() => setKind(option)}
            />
            {SOURCE_LABEL[option]}
          </label>
        ))}
      </fieldset>
      {kind === 'github' && (
        <p className={styles.hint}>The issues of this project’s GitHub repository (origin).</p>
      )}
      {kind === 'linear' && (
        <LinearConnect state={linearState} teamKey={teamKey} onTeamChange={setTeamKey} />
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={tasksStyles.formActions}>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button type="button" className={tasksStyles.primary} disabled={!next} onClick={save}>
          Use {SOURCE_LABEL[kind]}
        </button>
      </div>
    </section>
  )
}
