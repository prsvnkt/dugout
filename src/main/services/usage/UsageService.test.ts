import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import type { AgentAdapter, AgentUsageReader } from '../agents/AgentAdapter'
import { claudeAdapter } from '../agents/claude/claudeAdapter'
import { codexAdapter } from '../agents/codex/codexAdapter'
import { UsageFiles } from './usageFiles'
import { UsageService } from './UsageService'
import type { Attribution } from './usageState'

const FIXTURES = join(import.meta.dirname, '..', 'transcripts', 'fixtures')
const NOW = new Date(2026, 9, 8, 15, 0, 0)

function readerOf(adapter: AgentAdapter): AgentUsageReader {
  if (!adapter.usage) throw new Error(`${adapter.info.kind} reads no usage`)
  return adapter.usage
}

function setup(dataDir = mkdtempSync(join(tmpdir(), 'dugout-usage-'))) {
  const home = join(dataDir, 'home')
  const claudeRoot = join(home, '.claude')
  const codexRoot = join(home, '.codex')
  mkdirSync(join(claudeRoot, 'projects', 'repo'), { recursive: true })
  mkdirSync(join(codexRoot, 'sessions'), { recursive: true })
  const pendingSaves: Array<() => void> = []
  const files = new UsageFiles({
    ledger: join(dataDir, 'ledger.jsonl'),
    state: join(dataDir, 'state.json'),
  })
  const service = new UsageService({
    files,
    readers: {
      claude: { reader: readerOf(claudeAdapter), root: claudeRoot },
      codex: { reader: readerOf(codexAdapter), root: codexRoot },
    },
    now: () => NOW,
    scheduleSave: (save) => pendingSaves.push(save),
  })
  return { service, dataDir, claudeRoot, codexRoot, pendingSaves }
}

function claudeTranscript(root: string, name = 'session.jsonl'): string {
  const path = join(root, 'projects', 'repo', name)
  copyFileSync(join(FIXTURES, 'claude-session.jsonl'), path)
  appendFileSync(path, '\n')
  return path
}

const ATTRIBUTION: Attribution = {
  projectId: 'p1',
  agent: 'claude',
  task: 12,
  sessionId: 's-1',
  cwd: '/repo',
}

function report(service: UsageService, transcriptPath: string, attribution = ATTRIBUTION) {
  return service.report({ attribution, transcriptPath, isSubagent: false })
}

describe('UsageService', () => {
  test('totals a session once however often its transcript is reported', async () => {
    // Arrange
    const { service, claudeRoot } = setup()
    await service.load()
    const path = claudeTranscript(claudeRoot)

    // Act
    await report(service, path)
    const usage = await report(service, path)

    // Assert: msg_1 (opus), msg_2 (haiku subagent), msg_4 (opus); msg_5 is unfinished.
    expect(usage?.totals).toMatchObject({
      input: 10 + 5 + 3,
      output: 400 + 100 + 120,
      cacheRead: 30000 + 1000 + 32000,
      cacheWrite: 2000 + 500,
      unpricedTokens: 0,
    })
    expect(usage?.totals.costUsd).toBeGreaterThan(0)
  })

  test('shows how full the context window is, from the model', async () => {
    const { service, claudeRoot } = setup()
    await service.load()
    const usage = await report(service, claudeTranscript(claudeRoot))
    expect(usage?.context).toEqual({ tokens: 32503, window: 1_000_000 })
    expect(usage?.model).toBe('claude-opus-5-5')
  })

  test('does not count replies a forked session copied again', async () => {
    const { service, claudeRoot } = setup()
    await service.load()
    await report(service, claudeTranscript(claudeRoot, 'a.jsonl'))
    const forked = await report(service, claudeTranscript(claudeRoot, 'b.jsonl'), {
      ...ATTRIBUTION,
      sessionId: 's-2',
    })
    expect(forked?.totals.input ?? 0).toBe(0)
  })

  test('ignores transcripts outside the agent’s own folder', async () => {
    const { service, dataDir } = setup()
    await service.load()
    const outside = join(dataDir, 'elsewhere.jsonl')
    copyFileSync(join(FIXTURES, 'claude-session.jsonl'), outside)
    expect(await report(service, outside)).toBeNull()
    expect(service.projectUsage('p1').lifetime.input).toBe(0)
  })

  test('keeps totals across restarts and after the transcript is deleted', async () => {
    // Arrange
    const first = setup()
    await first.service.load()
    const path = claudeTranscript(first.claudeRoot)
    await report(first.service, path)
    await first.service.flush()
    rmSync(path)

    // Act
    const second = setup(first.dataDir)
    await second.service.load()

    // Assert
    expect(second.service.projectUsage('p1').lifetime.output).toBe(620)
    expect(second.service.sessionUsage('s-1')?.totals.output).toBe(620)
  })

  test('rebuilds totals from the ledger when the state was never saved', async () => {
    const first = setup()
    await first.service.load()
    await report(first.service, claudeTranscript(first.claudeRoot))
    // No flush and no scheduled save ran: only the ledger is on disk.

    const second = setup(first.dataDir)
    await second.service.load()
    expect(second.service.projectUsage('p1').lifetime.output).toBe(620)
  })

  test('counts the growth of a Codex running total, not the total again', async () => {
    // Arrange
    const { service, codexRoot } = setup()
    await service.load()
    const path = join(codexRoot, 'sessions', 'rollout.jsonl')
    writeFileSync(path, '')
    const codex: Attribution = { ...ATTRIBUTION, agent: 'codex', sessionId: 'c-1', task: null }
    const tokenCount = (input: number, cached: number, output: number) =>
      `${JSON.stringify({
        timestamp: '2026-10-08T12:00:00.000Z',
        type: 'event_msg',
        payload: {
          type: 'token_count',
          info: {
            total_token_usage: {
              input_tokens: input,
              cached_input_tokens: cached,
              output_tokens: output,
            },
          },
        },
      })}\n`

    // Act
    appendFileSync(path, tokenCount(1000, 600, 50))
    await report(service, path, codex)
    appendFileSync(path, tokenCount(3000, 2000, 120))
    const usage = await report(service, path, codex)

    // Assert
    expect(usage?.totals).toMatchObject({ input: 1000, cacheRead: 2000, output: 120 })
  })

  test('sums a project by agent, task, model and day', async () => {
    const { service, claudeRoot } = setup()
    await service.load()
    await report(service, claudeTranscript(claudeRoot))

    const usage = service.projectUsage('p1')

    expect(usage.byAgent.claude?.output).toBe(620)
    expect(usage.byTask).toEqual([
      { task: 12, totals: usage.lifetime, byAgent: { claude: usage.lifetime } },
    ])
    expect(usage.byModel.map((row) => row.model)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5'])
    expect(usage.days).toHaveLength(1)
    expect(usage.last30Days).toEqual(usage.lifetime)
    expect(service.projectUsage('other').lifetime.input).toBe(0)
  })

  test('saves through the scheduler', async () => {
    const { service, claudeRoot, pendingSaves, dataDir } = setup()
    await service.load()
    await report(service, claudeTranscript(claudeRoot))
    await report(service, claudeTranscript(claudeRoot))
    expect(pendingSaves).toHaveLength(1)
    pendingSaves[0]?.()
    await service.flush()
    const restarted = setup(dataDir)
    await restarted.service.load()
    expect(restarted.service.sessionUsage('s-1')?.context?.tokens).toBe(32503)
  })
})
