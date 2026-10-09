import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { AGENTS } from '@shared/agents'
import type { DevServer } from '@shared/preview'
import { isAgentKind, type TerminalKind } from '@shared/terminal'
import type { ToolCallPreview } from '@shared/toolCall'
import { displayTaskKey } from '@shared/tasks'
import { paneNumber, type PaneTask } from '@renderer/features/workspace/layout'
import { Icon } from '@renderer/lib/Icon'
import {
  ACTIVITY_LABEL,
  toPaneActivity,
  type PaneActivity,
} from '@renderer/features/workspace/paneActivity'
import type { Subagent } from '@renderer/features/agents/subagents'
import { WithheldServersNotice } from '@renderer/features/agentConfig/WithheldServersNotice'
import { CheckIndicator } from '@renderer/features/checks/CheckIndicator'
import { OpenInMenu } from '@renderer/features/openIn/OpenInMenu'
import { OverlapFlag } from '@renderer/features/overlaps/OverlapFlag'
import type { LabelledOverlap } from '@renderer/features/overlaps/overlaps'
import { TimelineButton } from '@renderer/features/timeline/TimelineButton'
import { UsageBadge } from '@renderer/features/usage/UsageBadge'
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
  /** The pane's worktree, which its header offers to open in an editor. */
  readonly worktreePath?: string | undefined
  /** The project's colour, the accent inside its pane (hidden projects' panes too). */
  readonly projectColor: string
  /** True when this pane should own keyboard focus (focused pane of the visible project). */
  readonly shouldFocus: boolean
  readonly isFocused: boolean
  /** Changes each time something asks to put the keyboard in this terminal (e.g. the inbox). */
  readonly focusRequest: number
  /** Resume this Claude conversation when the pane starts. */
  readonly resumeSessionId?: string | undefined
  /** First message for a new Claude session (e.g. the task it was started for). */
  readonly initialPrompt?: string | undefined
  /** Shown in the header for agents started on a task. */
  readonly task?: PaneTask | undefined
  /** Other agents that changed some of the same files (advisory), shown in the header. */
  readonly overlaps: readonly LabelledOverlap[]
  /** A dev server this shell starts, shown in its header with its port. */
  readonly devServer?: DevServer | undefined
  onFocus(): void
  onClose(): void
  onActivity(
    activity: PaneActivity,
    detail: string | null,
    approvals: readonly ToolCallPreview[],
  ): void
  onSubagents(subagents: readonly Subagent[]): void
  onTerminalId(terminalId: string | null): void
  onSessionId(sessionId: string): void
  /** `isFresh` when resuming failed (Claude exited before it was ready). */
  onRestart(options: { isFresh: boolean }): void
}

function kindLabel(kind: TerminalKind): string {
  return isAgentKind(kind) ? AGENTS[kind].productName : 'Shell'
}

function describe(activity: PaneActivity, status: TerminalStatus): string {
  if (status.state === 'exited') return `Exited (${status.exit.exitCode})`
  if (status.state === 'error') return status.message
  return ACTIVITY_LABEL[activity]
}

export function TerminalPane(props: TerminalPaneProps) {
  const { index, kind, projectId, cwd, branch, projectColor, shouldFocus, isFocused } = props
  const { focusRequest } = props
  const { resumeSessionId, initialPrompt, task, worktreePath, overlaps, devServer } = props
  const { onFocus, onClose, onActivity, onSubagents, onTerminalId, onSessionId, onRestart } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const terminal = useTerminal(containerRef, {
    kind,
    projectId,
    cwd,
    resumeSessionId,
    initialPrompt,
    devServer,
    taskNumber: task?.number,
  })
  const { status, agentStatus, agentDetail, agentApprovals, terminalId, sessionId } = terminal
  const { subagents, usage, withheldServers, focus } = terminal
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false)
  const canRestart = status.state === 'exited' || status.state === 'error'
  // If the agent never got ready, resuming failed (e.g. the session no longer exists).
  const isAgent = isAgentKind(kind)
  const neverReady = isAgent && (agentStatus === null || agentStatus === 'starting')
  const isDoneSeen = useDoneSeen(agentStatus, shouldFocus)
  const activity = toPaneActivity(status, agentStatus, isDoneSeen)

  useEffect(() => {
    if (shouldFocus) focus()
  }, [shouldFocus, focusRequest, focus])

  useEffect(
    () => onActivity(activity, agentDetail, agentApprovals),
    [activity, agentDetail, agentApprovals, onActivity],
  )
  useEffect(() => onSubagents(subagents), [subagents, onSubagents])
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
      aria-label={`${kindLabel(kind)} terminal`}
    >
      <header className={styles.header}>
        <span className={styles.number} aria-hidden data-testid="pane-number">
          {paneNumber(index)}
        </span>
        <span className={styles.kind}>{kindLabel(kind)}</span>
        {task && (
          <span className={styles.task} title={task.title}>
            {displayTaskKey(task)}
          </span>
        )}
        {devServer && (
          <span className={styles.task} title={`Dev server: ${devServer.command}`}>
            :{devServer.port}
          </span>
        )}
        {branch && (
          <span className={styles.branch} title={cwd}>
            ⎇ {branch}
          </span>
        )}
        <OverlapFlag overlaps={overlaps} className={styles.overlap} />
        {usage && <UsageBadge usage={usage} className={styles.usage} />}
        <ActivityIndicator
          activity={activity}
          label={describe(activity, status)}
          className={styles.status}
        />
        <CheckIndicator terminalId={terminalId} />
        {isAgent && (
          <TimelineButton
            projectId={projectId}
            agent={kind}
            sessionId={sessionId}
            taskKey={task && displayTaskKey(task)}
            className={styles.iconButton}
          />
        )}
        {worktreePath && <OpenInMenu checkout={{ projectId, worktreePath }} target="worktree" />}
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
          aria-label={`Close ${kindLabel(kind)} pane`}
          title="Close pane (⌘W)"
        >
          <Icon icon={X} />
        </button>
      </header>
      {isAgent && withheldServers && !isNoticeDismissed && (
        <WithheldServersNotice
          projectId={projectId}
          agentLabel={AGENTS[kind].label}
          withheld={withheldServers}
          onDismiss={() => setIsNoticeDismissed(true)}
        />
      )}
      <div ref={containerRef} className={styles.terminal} data-testid="terminal" />
    </section>
  )
}
