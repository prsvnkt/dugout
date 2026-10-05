import { useState } from 'react'
import type { TerminalKind } from '@shared/terminal'
import { TerminalPane } from '@renderer/features/terminal/TerminalPane'
import { dugout } from '@renderer/lib/dugout'
import styles from './App.module.css'

interface ActiveSession {
  readonly kind: TerminalKind
  readonly cwd: string
}

const DEFAULT_ACCENT = 'var(--project-teal)'

export function App() {
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [error, setError] = useState<string | null>(null)

  const start = async (kind: TerminalKind) => {
    try {
      const cwd = await dugout.dialog.pickFolder()
      if (cwd) setSession({ kind, cwd })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not open folder')
    }
  }

  return (
    <div className={styles.app}>
      <div className={styles.titlebar}>Dugout</div>
      <main className={styles.main}>
        {session ? (
          <TerminalPane kind={session.kind} cwd={session.cwd} accentColor={DEFAULT_ACCENT} />
        ) : (
          <div className={styles.empty}>
            <h1 className={styles.heading}>Start a session</h1>
            <p className={styles.hint}>Pick a repo folder to run an agent in.</p>
            <div className={styles.actions}>
              <button className={styles.primary} onClick={() => void start('claude')}>
                Start Claude Code…
              </button>
              <button className={styles.secondary} onClick={() => void start('shell')}>
                Open shell…
              </button>
            </div>
            {error && <p className={styles.error}>{error}</p>}
          </div>
        )}
      </main>
    </div>
  )
}
