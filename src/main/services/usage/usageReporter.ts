import type { AgentUsage } from '@shared/usage'
import type { TerminalManager } from '../terminal/TerminalManager'
import type { TranscriptReport } from './UsageService'

export interface UsageReporterDeps {
  readonly usage: { report(report: TranscriptReport): Promise<AgentUsage | null> }
  readonly terminals: Pick<TerminalManager, 'agentInfo' | 'reportUsage'>
  /** A project's totals changed; the renderer refreshes what it shows. */
  readonly onProjectChange: (projectId: string) => void
}

export interface TranscriptHint {
  readonly terminalId: string
  readonly transcriptPath: string
  /** The session the hook named; else the terminal's current one. */
  readonly sessionId?: string | undefined
  readonly isSubagent: boolean
}

/**
 * Turns a hook's transcript path into a usage report attributed to the terminal's project, task
 * and session, then tells the terminal's renderer and every window about the new totals.
 */
export function createUsageReporter(deps: UsageReporterDeps): (hint: TranscriptHint) => void {
  return ({ terminalId, transcriptPath, sessionId, isSubagent }) => {
    const info = deps.terminals.agentInfo(terminalId)
    const session = sessionId ?? info?.sessionId
    if (!info || !session) return
    const attribution = {
      projectId: info.projectId,
      agent: info.kind,
      task: info.taskNumber,
      sessionId: session,
      cwd: info.cwd,
    }
    void deps.usage.report({ attribution, transcriptPath, isSubagent }).then((usage) => {
      if (!usage) return
      deps.terminals.reportUsage(terminalId, usage)
      deps.onProjectChange(info.projectId)
    })
  }
}
