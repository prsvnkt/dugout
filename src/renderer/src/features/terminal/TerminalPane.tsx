import { useEffect, useRef, type CSSProperties } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { TerminalKind } from '@shared/terminal'
import {
  ACTIVITY_LABEL,
  toPaneActivity,
  type PaneActivity,
} from '@renderer/features/workspace/paneActivity'
import { ActivityIndicator } from './ActivityIndicator'
import { useDoneSeen } from './useDoneSeen'
import { useTerminal, type TerminalStatus } from './useTerminal'
import styles from './TerminalPane.module.css'

interface TerminalPaneProps {
  readonly kind: TerminalKind
  readonly projectId: string
  readonly cwd: string
  /** Branch of the pane's worktree, shown in its header. Null for the main checkout. */
  readonly branch: string | null
  readonly accentColor: string
  /** True when this pane should own keyboard focus (focused pane of the visible project). */
  readonly shouldFocus: boolean
  readonly isFocused: boolean
  /** Resume this Claude conversation when the pane starts. */
  readonly resumeSessionId?: string | undefined
  onFocus(): void
  onClose(): void
  onActivity(activity: PaneActivity): void
  onTerminalId(terminalId: string | null): void
  onSessionId(sessionId: string): void
  /** `isFresh` when resuming failed (Claude exited before it was ready). */
  onRestart(options: { isFresh: boolean }): void
}

const KIND_LABEL: Record<TerminalKind, string> = { claude: 'Claude Code', shell: 'Shell' }

function describe(activity: PaneActivity, status: TerminalStatus): string {
  if (status.state === 'exited') return `Exited (${status.exit.exitCode})`
  if (status.state === 'error') return status.message
  return ACTIVITY_LABEL[activity]
}

export function TerminalPane(props: TerminalPaneProps) {
  const { kind, projectId, cwd, branch, accentColor, shouldFocus, isFocused } = props
  const { resumeSessionId, onFocus, onClose, onActivity, onTerminalId, onSessionId, onRestart } =
    props
  const containerRef = useRef<HTMLDivElement>(null)
  const { status, agentStatus, terminalId, sessionId, focus } = useTerminal(containerRef, {
    kind,
    projectId,
    cwd,
    resumeSessionId,
  })
  const canRestart = status.state === 'exited' || status.state === 'error'
  // If Claude never got ready, resuming failed (e.g. the session no longer exists).
  const neverReady = kind === 'claude' && (agentStatus === null || agentStatus === 'starting')
  const isDoneSeen = useDoneSeen(agentStatus, shouldFocus)
  const activity = toPaneActivity(status, agentStatus, isDoneSeen)

  useEffect(() => {
    if (shouldFocus) focus()
  }, [shouldFocus, focus])

  useEffect(() => onActivity(activity), [activity, onActivity])
  useEffect(() => onTerminalId(terminalId), [terminalId, onTerminalId])
  useEffect(() => {
    if (sessionId) onSessionId(sessionId)
  }, [sessionId, onSessionId])

  return (
    <section
      className={styles.pane}
      data-focused={isFocused}
      style={{ '--accent': accentColor } as CSSProperties}
      onMouseDown={onFocus}
      aria-label={`${KIND_LABEL[kind]} terminal`}
    >
      <header className={styles.header}>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        {branch && (
          <span className={styles.branch} title={cwd}>
            ⎇ {branch}
          </span>
        )}
        <ActivityIndicator
          activity={activity}
          label={describe(activity, status)}
          className={styles.status}
        />
        {canRestart && (
          <button
            className={styles.restart}
            onClick={() => onRestart({ isFresh: neverReady })}
            onMouseDown={(event) => event.stopPropagation()}
            title={
              kind === 'claude' && !neverReady
                ? 'Restart, resuming the conversation'
                : 'Restart with a new session'
            }
          >
            {neverReady && kind === 'claude' ? 'Start new session' : 'Restart'}
          </button>
        )}
        <button
          className={styles.close}
          onClick={onClose}
          onMouseDown={(event) => event.stopPropagation()}
          aria-label={`Close ${KIND_LABEL[kind]} pane`}
          title="Close pane (⌘W)"
        >
          ×
        </button>
      </header>
      <div ref={containerRef} className={styles.terminal} data-testid="terminal" />
    </section>
  )
}
