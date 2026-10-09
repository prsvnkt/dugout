import type { CheckStatus } from '@shared/checks'

/** A check that has run or is running (not idle). */
export type ActiveCheck = Exclude<CheckStatus, { state: 'idle' }>
export type FailedCheck = Extract<CheckStatus, { state: 'failed' }>

const URGENCY: Readonly<Record<ActiveCheck['state'], number>> = {
  failed: 0,
  running: 1,
  passed: 2,
}

/** The check to show for several agents (e.g. on one task): a failure, else running, else passed. */
export function mostUrgentCheck(statuses: readonly CheckStatus[]): ActiveCheck | null {
  const active = statuses.filter((status): status is ActiveCheck => status.state !== 'idle')
  return [...active].sort((a, b) => URGENCY[a.state] - URGENCY[b.state])[0] ?? null
}

const LABEL: Readonly<Record<ActiveCheck['state'], string>> = {
  running: 'Checking…',
  passed: 'Check passed',
  failed: 'Check failed',
}

export function checkLabel(status: ActiveCheck): string {
  return LABEL[status.state]
}

/** A code fence longer than any run of backticks in the text, so it cannot end early. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

/** What "Send failure to agent" types into the agent: the command, how it ended, its output. */
export function checkFailurePrompt(status: FailedCheck): string {
  const ending = status.exitCode === null ? 'it was stopped' : `exit code ${status.exitCode}`
  const intro = [
    `The project check \`${status.command}\` failed (${ending}) after your last turn.`,
    'Fix what it reports, then finish again.',
    '',
  ]
  if (!status.output) return [...intro, 'It printed nothing.'].join('\n')
  const fence = fenceFor(status.output)
  return [...intro, 'Output (last lines):', fence, status.output, fence].join('\n')
}
