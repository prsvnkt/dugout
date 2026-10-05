import type { AgentStatus } from '@shared/agentStatus'
import type { TerminalStatus } from '@renderer/features/terminal/useTerminal'

/** What a pane shows the user: its agent's status, or its process state for shells. */
export type PaneActivity =
  'starting' | 'running' | 'idle' | 'working' | 'needs-input' | 'done' | 'exited' | 'error'

/** Activities worth surfacing outside the pane, most urgent first. */
const ATTENTION_ORDER: readonly PaneActivity[] = ['needs-input', 'done', 'working']

export function toPaneActivity(
  process: TerminalStatus,
  agent: AgentStatus | null,
  isDoneSeen: boolean,
): PaneActivity {
  if (process.state !== 'running') return process.state
  if (agent === null) return 'running'
  if (agent === 'done' && isDoneSeen) return 'idle'
  return agent
}

export function projectAttention(activities: readonly PaneActivity[]): PaneActivity | null {
  return ATTENTION_ORDER.find((activity) => activities.includes(activity)) ?? null
}

export const ACTIVITY_LABEL: Readonly<Record<PaneActivity, string>> = {
  starting: 'Starting…',
  running: 'Running',
  idle: 'Ready',
  working: 'Working',
  'needs-input': 'Needs you',
  done: 'Done',
  exited: 'Exited',
  error: 'Error',
}
