import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  MAX_PROJECT_NAME_LENGTH,
  PROJECT_COLORS,
  nextProjectColor,
  suggestProjectName,
  type Project,
  type ProjectColor,
} from '@shared/project'
import { projectColorVar } from './projectColor'
import { useProjectsStore } from './projectsStore'
import styles from './ProjectDialog.module.css'

export type ProjectDialogTarget =
  | { readonly mode: 'add'; readonly rootPath: string }
  | { readonly mode: 'edit'; readonly project: Project }

interface ProjectDialogProps {
  readonly target: ProjectDialogTarget
  onClose(): void
  onRemoved(project: Project): void
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.'
}

export function ProjectDialog({ target, onClose, onRemoved }: ProjectDialogProps) {
  const { projects, add, update, remove } = useProjectsStore()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEdit = target.mode === 'edit'
  const rootPath = isEdit ? target.project.rootPath : target.rootPath

  const [name, setName] = useState(() =>
    isEdit ? target.project.name : suggestProjectName(target.rootPath),
  )
  const [color, setColor] = useState<ProjectColor>(() =>
    isEdit ? target.project.color : nextProjectColor(projects),
  )
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isConfirmingRemove, setIsConfirmingRemove] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
  }, [])

  const run = async (action: () => Promise<void>) => {
    setIsBusy(true)
    setError(null)
    try {
      await action()
    } catch (cause) {
      setError(errorMessage(cause))
      setIsBusy(false)
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void run(async () => {
      if (isEdit) await update({ id: target.project.id, name, color })
      else await add({ name, color, rootPath })
      onClose()
    })
  }

  const removeProject = () => {
    if (!isEdit) return
    if (!isConfirmingRemove) {
      setIsConfirmingRemove(true)
      return
    }
    void run(async () => {
      await remove(target.project.id)
      onRemoved(target.project)
      onClose()
    })
  }

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={onClose}>
      <form className={styles.form} onSubmit={submit}>
        <h2 className={styles.title}>{isEdit ? 'Edit project' : 'Add project'}</h2>
        <p className={styles.path} title={rootPath}>
          {rootPath}
        </p>

        <label className={styles.label}>
          Name
          <input
            className={styles.input}
            value={name}
            maxLength={MAX_PROJECT_NAME_LENGTH}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            required
          />
        </label>

        <fieldset className={styles.colors}>
          <legend className={styles.label}>Colour</legend>
          {PROJECT_COLORS.map((option) => (
            <label key={option} className={styles.swatch} title={option}>
              <input
                type="radio"
                name="color"
                value={option}
                checked={color === option}
                onChange={() => setColor(option)}
                aria-label={option}
              />
              <span style={{ background: projectColorVar(option) }} />
            </label>
          ))}
        </fieldset>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.actions}>
          {isEdit && (
            <button
              type="button"
              className={styles.danger}
              onClick={removeProject}
              disabled={isBusy}
            >
              {isConfirmingRemove ? 'Click again to remove' : 'Remove project'}
            </button>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.secondary} onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className={styles.primary}
            style={{ background: projectColorVar(color) }}
            disabled={isBusy || name.trim().length === 0}
          >
            {isEdit ? 'Save' : 'Add project'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
