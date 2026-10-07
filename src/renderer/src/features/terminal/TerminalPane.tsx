import { useEffect, useRef, type CSSProperties } from 'react'
import '@xterm/xterm/css/xterm.css'
import { isAgentKind, type TerminalKind } from '@shared/terminal'
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
  /** Position in the project's pane row, shown as "01", "02"… in the header. */
  readonly index: number
  readonly kind: TerminalKind
  readonly projectId: string
  readonly cwd: string
  /** Branch of the pane's worktree, shown in its header. Null for the main checkout. */
  readonly branch: string | null
  /** The project's colour, the accent inside its pane (hidden projects' panes too). */
  readonly projectColor: string
  /** True when this pane should own keyboard focus (focused pane of the visible project). */
  readonly shouldFocus: boolean
  readonly isFocused: boolean
  /** Resume this Claude conversation when the pane starts. */
  readonly resumeSessionId?: string | undefined
  /** First message for a new Claude session (e.g. the task it was started for). */
  readonly initialPrompt?: string | undefined
  /** Shown in the header for agents started on a task. */
  readonly task?: { number: number; title: string } | undefined
  onFocus(): void
  onClose(): void
  onActivity(activity: PaneActivity, detail: string | null): void
  onTerminalId(terminalId: string | null): void
  onSessionId(sessionId: string): void
  /** `isFresh` when resuming failed (Claude exited before it was ready). */
  onRestart(options: { isFresh: boolean }): void
}

const KIND_LABEL: Record<TerminalKind, string> = {
  claude: 'Claude Code',
  codex: 'Codex',
  shell: 'Shell',
}

function paneNumber(index: number): string {
  return String(index + 1).padStart(2, '0')
}

function describe(activity: PaneActivity, status: TerminalStatus): string {
  if (status.state === 'exited') return `Exited (${status.exit.exitCode})`
  if (status.state === 'error') return status.message
  return ACTIVITY_LABEL[activity]
}

export function TerminalPane(props: TerminalPaneProps) {
  const { index, kind, projectId, cwd, branch, projectColor, shouldFocus, isFocused } = props
  const { resumeSessionId, initialPrompt, task } = props
  const { onFocus, onClose, onActivity, onTerminalId, onSessionId, onRestart } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const { status, agentStatus, agentDetail, terminalId, sessionId, focus } = useTerminal(
    containerRef,
    {
      kind,
      projectId,
      cwd,
      resumeSessionId,
      initialPrompt,
    },
  )
  const canRestart = status.state === 'exited' || status.state === 'error'
  // If Claude never got ready, resuming failed (e.g. the session no longer exists).
  const isAgent = isAgentKind(kind)
  const neverReady = isAgent && (agentStatus === null || agentStatus === 'starting')
  const isDoneSeen = useDoneSeen(agentStatus, shouldFocus)
  const activity = toPaneActivity(status, agentStatus, isDoneSeen)

  useEffect(() => {
    if (shouldFocus) focus()
  }, [shouldFocus, focus])

  useEffect(() => onActivity(activity, agentDetail), [activity, agentDetail, onActivity])
  useEffect(() => onTerminalId(terminalId), [terminalId, onTerminalId])
  useEffect(() => {
    if (sessionId) onSessionId(sessionId)
  }, [sessionId, onSessionId])

  return (
    <section
      className={styles.pane}
      data-focused={isFocused}
      style={{ '--accent': projectColor } as CSSProperties}
      onMouseDown={onFocus}
      aria-label={`${KIND_LABEL[kind]} terminal`}
    >
      <header className={styles.header}>
        <span className={styles.number} aria-hidden>
          {paneNumber(index)}
        </span>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        {task && (
          <span className={styles.task} title={task.title}>
            #{task.number}
          </span>
        )}
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
              isAgent && !neverReady
                ? 'Restart, resuming the conversation'
                : 'Restart with a new session'
            }
          >
            {neverReady ? 'Start new session' : 'Restart'}
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
