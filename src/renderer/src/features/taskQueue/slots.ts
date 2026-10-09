import type { QueuedTask } from '@shared/taskQueue'
import { isAgentKind } from '@shared/terminal'
import type { Pane, PaneId } from '@renderer/features/workspace/layout'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'

/** One agent of a project, as the queue sees it (decision 047). */
export interface SlotAgent {
  /** Null until its terminal has reported anything. */
  readonly activity: PaneActivity | null
  readonly taskNumber: number | null
}

/**
 * A task agent being started: `requesting` while its worktree is created (no agent yet),
 * `started` once its agent is open but has not yet worked, finished or closed.
 */
export interface Launch {
  readonly number: number
  readonly phase: 'requesting' | 'started'
}

/** Working, or waiting on you: these hold a slot. Ready and Done free it; so does closing. */
const BUSY: ReadonlySet<PaneActivity | null> = new Set([
  null,
  'starting',
  'running',
  'working',
  'needs-input',
])

/**
 * A started agent has not got going yet while it is starting, running before its first status
 * (`running`), or at Ready: an agent with a first prompt may say Ready for a moment before it
 * starts working. Until it reports anything else, it holds its slot even at Ready.
 */
const STILL_STARTING: ReadonlySet<PaneActivity | null> = new Set([
  null,
  'starting',
  'running',
  'idle',
])

/** The project's agents (not shells), with what each is doing. */
export function slotAgentsOf(
  panes: readonly Pick<Pane, 'id' | 'kind' | 'task'>[],
  activities: Readonly<Record<PaneId, PaneActivity>>,
): readonly SlotAgent[] {
  return panes
    .filter((pane) => isAgentKind(pane.kind))
    .map((pane) => ({
      activity: activities[pane.id] ?? null,
      taskNumber: pane.task?.number ?? null,
    }))
}

/** The starts still under way; the same array when none has settled. */
export function settleLaunches(
  launches: readonly Launch[],
  agents: readonly SlotAgent[],
): readonly Launch[] {
  const isSettled = (launch: Launch) => {
    if (launch.phase === 'requesting') return false
    const own = agents.filter((agent) => agent.taskNumber === launch.number)
    return own.length === 0 || own.some((agent) => !STILL_STARTING.has(agent.activity))
  }
  return launches.some(isSettled) ? launches.filter((launch) => !isSettled(launch)) : launches
}

/** How many of the project's agent slots are taken, counting starts under way. */
export function busySlots(agents: readonly SlotAgent[], launches: readonly Launch[]): number {
  const started = new Set(
    launches.filter((launch) => launch.phase === 'started').map((launch) => launch.number),
  )
  const busyAgents = agents.filter(
    (agent) =>
      BUSY.has(agent.activity) || (agent.taskNumber !== null && started.has(agent.taskNumber)),
  ).length
  return busyAgents + launches.filter((launch) => launch.phase === 'requesting').length
}

/** The queued tasks to start now, first in the queue first, while slots are free. */
export function tasksToStart(
  queue: readonly QueuedTask[],
  maxAgents: number,
  busy: number,
  launches: readonly Launch[],
): readonly QueuedTask[] {
  const free = Math.max(0, maxAgents - busy)
  return queue
    .filter((task) => !launches.some((launch) => launch.number === task.number))
    .slice(0, free)
}
