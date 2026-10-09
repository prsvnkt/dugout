import { useState, type FormEvent } from 'react'
import type { Project } from '@shared/project'
import { isSafeCopyPattern, parseCopyPatterns, type WorktreeSetup } from '@shared/worktreeSetup'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { Field } from './ServerForm'
import styles from './AgentSettings.module.css'

interface WorktreeSetupSectionProps {
  readonly project: Project
}

type SaveState =
  | { readonly state: 'idle' }
  | { readonly state: 'saving' }
  | { readonly state: 'saved' }
  | { readonly state: 'error'; readonly message: string }

function setupFromForm(copyText: string, commandText: string): WorktreeSetup | string {
  const copy = parseCopyPatterns(copyText)
  const unsafe = copy.find((pattern) => !isSafeCopyPattern(pattern))
  if (unsafe) return `"${unsafe}" must be relative to the repository, outside .git.`
  const command = commandText.trim()
  return command ? { copy, command } : { copy }
}

/** Per-project, opt-in: local files copied into new worktrees and a command run there first. */
export function WorktreeSetupSection({ project }: WorktreeSetupSectionProps) {
  const save = useProjectsStore((state) => state.setWorktreeSetup)
  const [copyText, setCopyText] = useState(project.worktreeSetup?.copy.join('\n') ?? '')
  const [command, setCommand] = useState(project.worktreeSetup?.command ?? '')
  const [saveState, setSaveState] = useState<SaveState>({ state: 'idle' })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const setup = setupFromForm(copyText, command)
    if (typeof setup === 'string') return setSaveState({ state: 'error', message: setup })
    setSaveState({ state: 'saving' })
    save(project.id, setup).then(
      () => setSaveState({ state: 'saved' }),
      (error: unknown) =>
        setSaveState({
          state: 'error',
          message: error instanceof Error ? error.message : 'Could not save.',
        }),
    )
  }
  const edited = () => setSaveState({ state: 'idle' })

  return (
    <form className={styles.form} onSubmit={submit} aria-label="Worktree setup">
      <Field label="Files to copy" hint="globs from the main checkout, one per line">
        {(id) => (
          <textarea
            id={id}
            rows={3}
            value={copyText}
            placeholder=".env*"
            onChange={(event) => {
              setCopyText(event.target.value)
              edited()
            }}
          />
        )}
      </Field>
      <Field label="Setup command" hint="runs in your shell, in the new worktree">
        {(id) => (
          <input
            id={id}
            value={command}
            placeholder="npm install"
            onChange={(event) => {
              setCommand(event.target.value)
              edited()
            }}
          />
        )}
      </Field>
      {saveState.state === 'error' && (
        <p className={styles.error} role="alert">
          {saveState.message}
        </p>
      )}
      <div className={styles.formActions}>
        <button type="submit" className={styles.primary} disabled={saveState.state === 'saving'}>
          Save worktree setup
        </button>
        {saveState.state === 'saved' && (
          <span className={styles.ok} role="status">
            Saved. New worktrees use it.
          </span>
        )}
      </div>
    </form>
  )
}
