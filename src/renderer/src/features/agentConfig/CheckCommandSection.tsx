import { useId, useState, type FormEvent } from 'react'
import { MAX_CHECK_COMMAND_LENGTH } from '@shared/checks'
import type { ProjectId } from '@shared/project'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import styles from './AgentSettings.module.css'

interface CheckCommandFormProps {
  readonly projectId: ProjectId
  /** The saved command, or '' when Verify on Stop is off. */
  readonly saved: string
}

function CheckCommandForm({ projectId, saved }: CheckCommandFormProps) {
  const setCheckCommand = useProjectsStore((state) => state.setCheckCommand)
  const [draft, setDraft] = useState(saved)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const inputId = useId()

  const save = async (command: string | null) => {
    setIsBusy(true)
    setError(null)
    try {
      await setCheckCommand(projectId, command)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setIsBusy(false)
    }
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void save(draft.trim() || null)
  }

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Verify on Stop">
      <div className={styles.field}>
        <label htmlFor={inputId}>
          Check command <span className={styles.hint}>runs in the agent’s checkout</span>
        </label>
        <input
          id={inputId}
          value={draft}
          maxLength={MAX_CHECK_COMMAND_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="npm run check"
          spellCheck={false}
        />
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.formActions}>
        <button
          type="submit"
          className={styles.primary}
          disabled={isBusy || draft.trim() === saved}
        >
          Save
        </button>
        {saved && (
          <button type="button" disabled={isBusy} onClick={() => void save(null)}>
            Turn off
          </button>
        )}
      </div>
    </form>
  )
}

/** Verify on Stop: the project's check command, run each time one of its agents finishes. */
export function CheckCommandSection({ projectId }: { projectId: ProjectId }) {
  const saved = useProjectsStore(
    (state) => state.projects.find((project) => project.id === projectId)?.checkCommand ?? '',
  )
  return (
    <>
      <p className={styles.muted}>
        {saved
          ? 'On. When an agent finishes, Dugout runs this command in its checkout and shows whether it passed.'
          : 'Off. Set a command (e.g. your tests or linter) to run it in an agent’s checkout each time the agent finishes, and see whether it passed.'}{' '}
        Saved in Dugout, not in the repo.
      </p>
      {/* Remounts with the saved value, so the draft resets after a save. */}
      <CheckCommandForm key={saved} projectId={projectId} saved={saved} />
    </>
  )
}
