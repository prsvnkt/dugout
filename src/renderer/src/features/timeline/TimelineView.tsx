import {
  Bot,
  CircleCheck,
  CircleDashed,
  CircleX,
  Coins,
  MessageSquare,
  MessageSquareText,
  RefreshCw,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { AGENTS } from '@shared/agents'
import type { ProjectId } from '@shared/project'
import type { SessionTimeline, TimelineEvent, TimelineOutcome, TouchedFile } from '@shared/timeline'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import type { TimelineTarget } from '@renderer/features/editor/tabs'
import { Icon } from '@renderer/lib/Icon'
import {
  countTimeline,
  formatClock,
  formatDuration,
  OUTCOME_LABEL,
  summarize,
} from './timelineFormat'
import { useSessionTimeline } from './useSessionTimeline'
import styles from './TimelineView.module.css'

/** How much of a session id the byline shows; the tooltip has all of it. */
const SHORT_SESSION_ID = 8

const STEP_ICON: Readonly<Record<TimelineEvent['kind'], LucideIcon>> = {
  prompt: MessageSquare,
  message: MessageSquareText,
  tool: Wrench,
  subagent: Bot,
}

const OUTCOME_ICON: Readonly<Record<TimelineOutcome, LucideIcon>> = {
  ok: CircleCheck,
  failed: CircleX,
  pending: CircleDashed,
}

/** Status in words beside its icon, never colour alone. */
function Outcome({ outcome }: { outcome: TimelineOutcome }) {
  return (
    <span className={styles.outcome} data-outcome={outcome}>
      <Icon icon={OUTCOME_ICON[outcome]} />
      {OUTCOME_LABEL[outcome]}
    </span>
  )
}

function StepBody({ event }: { event: TimelineEvent }) {
  switch (event.kind) {
    case 'prompt':
      return <div className={styles.prompt}>{event.text}</div>
    case 'message':
      return <div className={styles.message}>{event.text}</div>
    case 'tool':
      return (
        <div className={styles.call}>
          <span className={styles.toolName}>{event.name}</span>
          {event.detail && <span className={styles.detail}>{event.detail}</span>}
          <Outcome outcome={event.outcome} />
        </div>
      )
    case 'subagent':
      return (
        <div className={styles.call}>
          <span className={styles.toolName}>
            Subagent{event.agentType && ` · ${event.agentType}`}
          </span>
          {event.detail && <span className={styles.detail}>{event.detail}</span>}
          <Outcome outcome={event.outcome} />
        </div>
      )
  }
}

function Steps({ events }: { events: readonly TimelineEvent[] }) {
  return (
    <ol className={styles.steps} aria-label="Steps">
      {events.map((event, index) => (
        <li
          key={'id' in event ? event.id : `${event.kind}-${index}`}
          className={styles.step}
          data-kind={event.kind}
        >
          <time className={styles.time} dateTime={event.at}>
            {formatClock(event.at)}
          </time>
          <span className={styles.stepIcon}>
            <Icon icon={STEP_ICON[event.kind]} />
          </span>
          <div className={styles.body}>
            <StepBody event={event} />
          </div>
        </li>
      ))}
    </ol>
  )
}

function Files({ files }: { files: readonly TouchedFile[] }) {
  const edited = files.filter((file) => file.change === 'edited')
  const read = files.filter((file) => file.change === 'read')
  return (
    <section aria-label="Files touched">
      <h2 className={styles.sectionTitle}>Files touched</h2>
      <ul className={styles.files}>
        {[...edited, ...read].map((file) => (
          <li key={file.path} className={styles.file} data-change={file.change}>
            {file.path}
            <span className={styles.changeLabel}>{file.change}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Byline({ timeline }: { timeline: SessionTimeline }) {
  const { agent, sessionId, startedAt, endedAt } = timeline
  const duration = formatDuration(startedAt, endedAt)
  const span =
    startedAt && endedAt
      ? `${formatClock(startedAt)} – ${formatClock(endedAt)}${duration ? ` (${duration})` : ''}`
      : null
  return (
    <p className={styles.byline}>
      {AGENTS[agent].productName} · session{' '}
      <span title={sessionId}>{sessionId.slice(0, SHORT_SESSION_ID)}</span>
      {span && ` · ${span}`}
    </p>
  )
}

function Loaded({ timeline }: { timeline: SessionTimeline }) {
  const isEmpty = timeline.events.length === 0
  return (
    <>
      <p className={styles.summary}>{summarize(countTimeline(timeline))}</p>
      {timeline.isTruncated && (
        <p className={styles.notice}>Long session: only its most recent steps are shown.</p>
      )}
      {timeline.finalMessage && (
        <section aria-label="Final message">
          <h2 className={styles.sectionTitle}>Final message</h2>
          <p className={styles.final}>{timeline.finalMessage}</p>
        </section>
      )}
      {timeline.files.length > 0 && <Files files={timeline.files} />}
      <section>
        <h2 className={styles.sectionTitle}>Steps</h2>
        {isEmpty ? (
          <p className={styles.notice}>Nothing in this session yet.</p>
        ) : (
          <Steps events={timeline.events} />
        )}
      </section>
    </>
  )
}

/**
 * One agent session, step by step, from its transcript (decision 048): prompts, what the agent
 * said, tool calls and subagents with how they ended, the files touched and its final message.
 * Tokens and cost stay in the Usage view, which this links to.
 */
export function TimelineView({
  projectId,
  target,
}: {
  projectId: ProjectId
  target: TimelineTarget
}) {
  const { state, reload } = useSessionTimeline(projectId, target)
  const openUsage = useEditorStore((store) => store.openUsage)
  return (
    <section className={styles.view} aria-label="Session timeline">
      <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Session timeline</h1>
            {state.status === 'loaded' && <Byline timeline={state.timeline} />}
          </div>
          <div className={styles.actions}>
            <button className={styles.button} onClick={reload} title="Refresh">
              <Icon icon={RefreshCw} />
              Refresh
            </button>
            <button
              className={styles.button}
              onClick={() => openUsage(projectId)}
              title="Tokens and cost live in Token usage"
            >
              <Icon icon={Coins} />
              Token usage
            </button>
          </div>
        </header>
        {state.status === 'loading' && (
          <p className={styles.notice} role="status">
            Reading the transcript…
          </p>
        )}
        {state.status === 'error' && (
          <p className={styles.notice} role="alert">
            {state.message}
          </p>
        )}
        {state.status === 'loaded' && <Loaded timeline={state.timeline} />}
      </div>
    </section>
  )
}
