import { describe, expect, test, vi } from 'vitest'
import { EMPTY_TOTALS, type AgentUsage } from '@shared/usage'
import type { AgentTerminalInfo } from '../terminal/TerminalManager'
import { createUsageReporter } from './usageReporter'

const INFO: AgentTerminalInfo = {
  kind: 'codex',
  projectId: 'p1',
  cwd: '/wt/abc',
  taskNumber: 7,
  sessionId: 'from-terminal',
}
const USAGE: AgentUsage = { sessionId: 's', totals: EMPTY_TOTALS, model: null, context: null }

function setup(info: AgentTerminalInfo | null, usage: AgentUsage | null = USAGE) {
  const report = vi.fn().mockResolvedValue(usage)
  const reportUsage = vi.fn()
  const onProjectChange = vi.fn()
  const reporter = createUsageReporter({
    usage: { report },
    terminals: { agentInfo: () => info, reportUsage },
    onProjectChange,
  })
  return { reporter, report, reportUsage, onProjectChange }
}

describe('createUsageReporter', () => {
  test('attributes the transcript to the terminal’s project, task and the hook’s session', async () => {
    // Arrange
    const { reporter, report, reportUsage, onProjectChange } = setup(INFO)

    // Act
    reporter({ terminalId: 't1', transcriptPath: '/x.jsonl', sessionId: 'hook', isSubagent: true })
    await vi.waitFor(() => expect(onProjectChange).toHaveBeenCalledWith('p1'))

    // Assert
    expect(report).toHaveBeenCalledWith({
      attribution: { projectId: 'p1', agent: 'codex', task: 7, sessionId: 'hook', cwd: '/wt/abc' },
      transcriptPath: '/x.jsonl',
      isSubagent: true,
    })
    expect(reportUsage).toHaveBeenCalledWith('t1', USAGE)
  })

  test('falls back to the terminal’s session', () => {
    const { reporter, report } = setup(INFO)
    reporter({ terminalId: 't1', transcriptPath: '/x.jsonl', isSubagent: false })
    expect(report.mock.calls[0]?.[0].attribution.sessionId).toBe('from-terminal')
  })

  test('ignores shells, unknown terminals and agents without a session yet', () => {
    const none = setup(null)
    none.reporter({ terminalId: 't1', transcriptPath: '/x.jsonl', isSubagent: false })
    const noSession = setup({ ...INFO, sessionId: null })
    noSession.reporter({ terminalId: 't1', transcriptPath: '/x.jsonl', isSubagent: false })
    expect(none.report).not.toHaveBeenCalled()
    expect(noSession.report).not.toHaveBeenCalled()
  })

  test('tells no one when the transcript could not be read', async () => {
    const { reporter, report, reportUsage, onProjectChange } = setup(INFO, null)
    reporter({ terminalId: 't1', transcriptPath: '/x.jsonl', isSubagent: false })
    await vi.waitFor(() => expect(report).toHaveBeenCalled())
    await Promise.resolve()
    expect(reportUsage).not.toHaveBeenCalled()
    expect(onProjectChange).not.toHaveBeenCalled()
  })
})
