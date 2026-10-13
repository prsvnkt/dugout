import { useCallback, useRef, useState, type CSSProperties } from 'react'
import { Code, ExternalLink, Folder, type LucideIcon } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { useMenuKeys } from '@renderer/lib/useArrowNavigation'
import { useDismiss } from '@renderer/lib/useDismiss'
import { EXTERNAL_APP_LABEL, type ExternalAppId } from '@shared/openIn'
import type { GitCheckout } from '@shared/worktree'
import { useOpenIn, type OpenInState } from './useOpenIn'
import styles from './OpenInMenu.module.css'

const MENU_WIDTH_PX = 190
const MENU_GAP_PX = 4

/** Editors share one icon; Finder gets a folder. */
const APP_ICON: Readonly<Record<ExternalAppId, LucideIcon>> = {
  vscode: Code,
  cursor: Code,
  zed: Code,
  finder: Folder,
}

interface OpenInMenuProps {
  readonly checkout: GitCheckout
  /** What is opened, for the button's accessible name: "project" or "worktree". */
  readonly target: 'project' | 'worktree'
}

interface AppItemsProps {
  readonly apps: OpenInState
  readonly error: string | null
  onChoose(app: ExternalAppId): void
}

function AppItems({ apps, error, onChoose }: AppItemsProps) {
  if (apps.state === 'loading') return <p className={styles.note}>Looking for apps…</p>
  if (apps.state === 'error') return <p className={styles.error}>{apps.message}</p>
  const { installed, lastUsed } = apps.apps
  return (
    <>
      {installed.map((app) => (
        <button
          key={app}
          role="menuitem"
          className={styles.item}
          onClick={() => onChoose(app)}
          // The last choice gets focus, so Enter opens it again.
          autoFocus={app === (lastUsed ?? installed[0])}
        >
          <Icon icon={APP_ICON[app]} />
          <span className={styles.label}>{EXTERNAL_APP_LABEL[app]}</span>
          {app === lastUsed && <span className={styles.hint}>last used</span>}
        </button>
      ))}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  )
}

/** "Open in…": opens a checkout in an editor or Finder, through main. */
export function OpenInMenu({ checkout, target }: OpenInMenuProps) {
  // Fixed to the window: pane headers clip anything that overflows them.
  const [menuAt, setMenuAt] = useState<CSSProperties | null>(null)
  const [error, setError] = useState<string | null>(null)
  const isOpen = menuAt !== null
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const { apps, open } = useOpenIn(checkout, isOpen)
  const onMenuKeyDown = useMenuKeys(menuRef, isOpen)

  const close = useCallback(() => {
    setMenuAt(null)
    setError(null)
  }, [])
  useDismiss(wrapRef, isOpen, close, triggerRef)

  const toggle = (button: HTMLElement) => {
    if (isOpen) return close()
    const rect = button.getBoundingClientRect()
    setMenuAt({
      top: rect.bottom + MENU_GAP_PX,
      left: Math.max(MENU_GAP_PX, rect.right - MENU_WIDTH_PX),
      width: MENU_WIDTH_PX,
    })
  }

  const choose = async (app: ExternalAppId) => {
    const message = await open(app)
    if (message === null) close()
    else setError(message)
  }

  return (
    // Keeps the click from focusing the terminal under the pane header.
    <div className={styles.wrap} ref={wrapRef} onMouseDown={(event) => event.stopPropagation()}>
      <button
        ref={triggerRef}
        className={styles.trigger}
        onClick={(event) => toggle(event.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Open ${target} in…`}
        title={`Open this ${target} in an editor or Finder`}
      >
        <Icon icon={ExternalLink} />
        Open in…
      </button>
      {menuAt && (
        <div
          className={styles.menu}
          style={menuAt}
          role="menu"
          aria-label="Open in"
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          <AppItems apps={apps} error={error} onChoose={(app) => void choose(app)} />
        </div>
      )}
    </div>
  )
}
