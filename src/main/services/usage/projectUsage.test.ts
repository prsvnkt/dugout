import { describe, expect, test } from 'vitest'
import type { AgentKind } from '@shared/agents'
import { EMPTY_TOTALS, type UsageTotals } from '@shared/usage'
import { PRICES_AS_OF } from './prices'
import { daysBefore, projectUsage, RECENT_DAYS } from './projectUsage'
import { EMPTY_STATE, rowKey, type UsageRow, type UsageState } from './usageState'

const TODAY = '2026-10-09'

interface RowOptions {
  readonly projectId?: string
  readonly agent?: AgentKind
  readonly model?: string | null
  readonly task?: number | null
}

function totals(input: number): UsageTotals {
  return { ...EMPTY_TOTALS, input, costUsd: input / 100 }
}

function row(day: string, input: number, options: RowOptions = {}): UsageRow {
  return {
    day,
    projectId: 'p1',
    agent: 'claude',
    model: 'claude-opus-4-5',
    task: null,
    ...options,
    totals: totals(input),
  }
}

function stateWith(rows: readonly UsageRow[]): UsageState {
  return { ...EMPTY_STATE, rows: Object.fromEntries(rows.map((r) => [rowKey(r), r])) }
}

describe('daysBefore', () => {
  test.each([
    [TODAY, 0, TODAY],
    [TODAY, 29, '2026-09-10'],
    ['2026-03-01', 1, '2026-02-28'],
    ['2026-01-01', 1, '2025-12-31'],
  ])('%s minus %i days is %s', (today, days, expected) => {
    expect(daysBefore(today, days)).toBe(expected)
  })
})

describe('projectUsage', () => {
  test('is all zero for a project without usage', () => {
    const usage = projectUsage(stateWith([row(TODAY, 5, { projectId: 'other' })]), 'p1', TODAY)

    expect(usage).toEqual({
      lifetime: EMPTY_TOTALS,
      last30Days: EMPTY_TOTALS,
      byAgent: {},
      byModel: [],
      byTask: [],
      days: [],
      pricesAsOf: PRICES_AS_OF,
    })
  })

  test('counts the 30th day back as recent and the 31st as lifetime only', () => {
    const first = daysBefore(TODAY, RECENT_DAYS - 1)
    const tooOld = daysBefore(TODAY, RECENT_DAYS)

    const usage = projectUsage(stateWith([row(first, 3), row(tooOld, 100)]), 'p1', TODAY)

    expect(usage.lifetime.input).toBe(103)
    expect(usage.last30Days.input).toBe(3)
    expect(usage.days.map((d) => d.day)).toEqual([first])
  })

  test('sums by agent and lists days newest first', () => {
    const usage = projectUsage(
      stateWith([
        row('2026-10-07', 1),
        row(TODAY, 2),
        row(TODAY, 4, { agent: 'codex', model: 'gpt-5' }),
      ]),
      'p1',
      TODAY,
    )

    expect(usage.byAgent.claude?.input).toBe(3)
    expect(usage.byAgent.codex?.input).toBe(4)
    expect(usage.days.map((d) => [d.day, d.totals.input])).toEqual([
      [TODAY, 6],
      ['2026-10-07', 1],
    ])
    expect(usage.days[0]?.byAgent.codex?.input).toBe(4)
  })

  test('sorts models by cost, then name, and names a missing model "unknown"', () => {
    const usage = projectUsage(
      stateWith([
        row(TODAY, 10, { model: 'b-model' }),
        row(TODAY, 10, { model: 'a-model' }),
        row(TODAY, 50, { model: null }),
      ]),
      'p1',
      TODAY,
    )

    expect(usage.byModel.map((m) => m.model)).toEqual(['unknown', 'a-model', 'b-model'])
  })

  test('lists tasks newest first, each with its agents', () => {
    const usage = projectUsage(
      stateWith([
        row(TODAY, 1, { task: 3 }),
        row(TODAY, 2, { task: 12 }),
        row(TODAY, 4, { task: 12, agent: 'codex' }),
        row(TODAY, 8),
      ]),
      'p1',
      TODAY,
    )

    expect(usage.byTask.map((t) => [t.task, t.totals.input])).toEqual([
      [12, 6],
      [3, 1],
    ])
    expect(usage.byTask[0]?.byAgent.codex?.input).toBe(4)
    expect(usage.lifetime.input).toBe(15)
  })
})
