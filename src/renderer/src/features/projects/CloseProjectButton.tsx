import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import type { Project } from '@shared/project'
import { useCloseProject, useOpenPaneCount } from './useCloseProject'
import styles from './ProjectTabs.module.css'

const CONFIRM_WIDTH_PX = 260
const CONFIRM_GAP_PX = 4

/** What the dialog under the × shows: the confirmation, or why closing failed. */
interface Prompt {
  /** Fixed to the window, under the button: the scrolling tab strip would clip it. */
  readonly at: CSSProperties
  readonly error: string | null
}

function promptUnder(button: HTMLElement | null, error: string | null): Prompt {
  const rect = button?.getBoundingClientRect()
  const at = rect
    ? {
        top: rect.bottom + CONFIRM_GAP_PX,
        left: Math.max(CONFIRM_GAP_PX, rect.right - CONFIRM_WIDTH_PX),
      }
    : {}
  return { at, error }
}

interface CloseDialogProps {
  readonly label: string
  readonly at: CSSProperties
  onClosed(): void
  readonly children: ReactNode
}

/**
 * A native modal `<dialog>` (as SignInDialog): it traps focus, Escape cancels, a click outside
 * it (on the backdrop) cancels, and buttons in a `method="dialog"` form close it.
 */
function CloseDialog({ label, at, onClosed, children }: CloseDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // showModal focuses the first button; React's autoFocus is not an attribute it sees.
    dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      className={styles.confirm}
      style={at}
      aria-label={label}
      onClose={onClosed}
      onClick={(event) => event.target === event.currentTarget && event.currentTarget.close()}
    >
      <div className={styles.confirmBody}>{children}</div>
    </dialog>
  )
}

/** The close button on a tab: closes the project, asking first when agents or shells would stop. */
export function CloseProjectButton({ project }: { project: Project }) {
  const openPanes = useOpenPaneCount(project.id)
  const closeProject = useCloseProject()
  const [prompt, setPrompt] = useState<Prompt | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const closeNow = () => {
    closeProject(project.id).catch((error: unknown) => {
      console.error('[projects] could not close the project', error)
      const reason = error instanceof Error ? error.message : String(error)
      setPrompt(promptUnder(buttonRef.current, `Could not close ${project.name}: ${reason}`))
    })
  }

  const onDialogClosed = () => {
    setPrompt(null)
    buttonRef.current?.focus()
  }

  return (
    <div className={styles.closeWrap}>
      <button
        ref={buttonRef}
        className={styles.close}
        onClick={(event) =>
          openPanes > 0 ? setPrompt(promptUnder(event.currentTarget, null)) : closeNow()
        }
        aria-label={`Close ${project.name}`}
        title="Close project (the folder stays on disk)"
      >
        <Icon icon={X} />
      </button>
      {prompt && (
        <CloseDialog label={`Close ${project.name}?`} at={prompt.at} onClosed={onDialogClosed}>
          {prompt.error ? (
            <>
              <p role="alert">{prompt.error}</p>
              <form method="dialog" className={styles.confirmActions}>
                <button data-autofocus>OK</button>
              </form>
            </>
          ) : (
            <>
              <p>
                Close {project.name}? Its{' '}
                {openPanes === 1 ? 'agent or shell' : `${openPanes} agents and shells`} will stop.
                The folder stays on disk.
              </p>
              <form method="dialog" className={styles.confirmActions}>
                <button>Cancel</button>
                <button className={styles.danger} onClick={closeNow} data-autofocus>
                  Close project
                </button>
              </form>
            </>
          )}
        </CloseDialog>
      )}
    </div>
  )
}
