import { describe, expect, test } from 'vitest'
import type { TokenDetail, UsageObservation } from '../transcripts/types'
import { costOf } from './prices'
import {
  applyEntries,
  EMPTY_STATE,
  entriesFor,
  localDay,
  prune,
  rowKey,
  withContext,
  withCursor,
  type Attribution,
  type Cursor,
  type UsageState,
} from './usageState'

const MODEL = 'claude-opus-4-5'
const NOW = new Date(2026, 9, 9, 12, 0, 0)
const ATTRIBUTION: Attribution = {
  projectId: 'p1',
  agent: 'claude',
  task: 7,
  sessionId: 's1',
  cwd: '/repos/demo',
}

function detail(overrides: Partial<TokenDetail> = {}): TokenDetail {
  return { input: 10, output: 5, cacheRead: 0, cacheWrite: 0, cacheWriteLong: 0, ...overrides }
}

/** Noon local time on `day`, so the local day never depends on the machine's time zone. */
function noon(day: string): string {
  return new Date(`${day}T12:00:00`).toISOString()
}

function message(id: string, overrides: Partial<TokenDetail> = {}, at = noon('2026-10-08')) {
  return { kind: 'message', id, model: MODEL, at, tokens: detail(overrides) } as const
}

function cumulative(key: string, tokens: TokenDetail, at = noon('2026-10-08')) {
  return { kind: 'cumulative', key, model: MODEL, at, tokens } as const
}

function entries(observations: readonly UsageObservation[], state: UsageState = EMPTY_STATE) {
  return entriesFor(state, observations, ATTRIBUTION, NOW)
}

describe('entriesFor', () => {
  test('counts a message id once within one read', () => {
    const result = entries([message('m1'), message('m1'), message('m2')])

    expect(result.map((entry) => entry.key)).toEqual(['m1', 'm2'])
  })

  test('skips a message id already counted from another file', () => {
    const state = applyEntries(EMPTY_STATE, entries([message('m1')]))

    const result = entries([message('m1'), message('m3')], state)

    expect(result.map((entry) => entry.key)).toEqual(['m3'])
  })

  test('attributes the entry and drops cacheWriteLong from the recorded tokens', () => {
    const [entry] = entries([message('m1', { cacheWrite: 4, cacheWriteLong: 2 })])

    expect(entry).toMatchObject({ ...ATTRIBUTION, key: 'm1', kind: 'message', model: MODEL })
    expect(entry?.tokens).toEqual({ input: 10, output: 5, cacheRead: 0, cacheWrite: 4 })
    expect(entry?.total).toBeUndefined()
  })

  test('uses the local day of the observation timestamp', () => {
    const [entry] = entries([message('m1', {}, noon('2026-01-02'))])

    expect(entry?.day).toBe('2026-01-02')
  })

  test.each(['not a date', ''])('falls back to the current day for the timestamp %j', (at) => {
    const [entry] = entries([message('m1', {}, at)])

    expect(entry?.day).toBe(localDay(NOW))
  })

  test('records a null cost for a model without a price', () => {
    const [entry] = entries([{ ...message('m1'), model: 'mystery-model' }])

    expect(entry?.costUsd).toBeNull()
  })
})

describe('entriesFor running totals', () => {
  test('counts the first total in full and keeps it as the session total', () => {
    const [entry] = entries([cumulative('s1', detail({ input: 100 }))])

    expect(entry?.tokens.input).toBe(100)
    expect(entry?.total).toEqual(detail({ input: 100 }))
  })

  test('counts only the growth since the last total in the same read', () => {
    const result = entries([
      cumulative('s1', detail({ input: 100, output: 10 })),
      cumulative('s1', detail({ input: 150, output: 30 })),
    ])

    expect(result[1]?.tokens).toEqual({ input: 50, output: 20, cacheRead: 0, cacheWrite: 0 })
  })

  test('counts the growth since the total saved in the state', () => {
    const state = applyEntries(EMPTY_STATE, entries([cumulative('s1', detail({ input: 100 }))]))

    const [entry] = entries([cumulative('s1', detail({ input: 160 }))], state)

    expect(entry?.tokens.input).toBe(60)
  })

  test('skips a total that did not grow', () => {
    const result = entries([cumulative('s1', detail()), cumulative('s1', detail())])

    expect(result).toHaveLength(1)
  })

  test.each(['input', 'output', 'cacheRead', 'cacheWrite'] as const)(
    'starts again from zero when %s goes down',
    (field) => {
      const previous = detail({ input: 100, output: 100, cacheRead: 100, cacheWrite: 100 })
      const grown = { ...previous, input: 120, output: 120, cacheRead: 120, cacheWrite: 120 }
      const restarted = { ...grown, [field]: 50 }

      const result = entries([cumulative('s1', previous), cumulative('s1', restarted)])

      expect(result[1]?.tokens[field]).toBe(50)
      expect(result[1]?.tokens.input).toBe(field === 'input' ? 50 : 120)
    },
  )

  test('clamps a shrinking cacheWriteLong to zero instead of a negative cost', () => {
    const previous = detail({ input: 0, output: 0, cacheWrite: 100, cacheWriteLong: 100 })
    const next = detail({ input: 0, output: 0, cacheWrite: 200, cacheWriteLong: 50 })

    const result = entries([cumulative('s1', previous), cumulative('s1', next)])

    const growth = detail({ input: 0, output: 0, cacheWrite: 100, cacheWriteLong: 0 })
    expect(result[1]?.costUsd).toBe(costOf(MODEL, growth))
    expect(result[1]?.costUsd).not.toBe(costOf(MODEL, { ...growth, cacheWriteLong: -50 }))
  })
})

describe('applyEntries', () => {
  test('returns the same state for no entries', () => {
    const state = applyEntries(EMPTY_STATE, entries([message('m1')]))

    expect(applyEntries(state, [])).toBe(state)
  })

  test('sums entries into one row per day, project, agent, model and task', () => {
    const result = applyEntries(EMPTY_STATE, entries([message('m1'), message('m2')]))

    const key = rowKey({
      day: '2026-10-08',
      projectId: 'p1',
      agent: 'claude',
      model: MODEL,
      task: 7,
    })
    expect(Object.keys(result.rows)).toEqual([key])
    expect(result.rows[key]?.totals.input).toBe(20)
    expect(result.rows[key]?.totals.unpricedTokens).toBe(0)
  })

  test('counts unpriced tokens separately', () => {
    const observation = { ...message('m1'), model: 'mystery-model' }

    const result = applyEntries(EMPTY_STATE, entries([observation]))

    const [row] = Object.values(result.rows)
    expect(row?.totals).toMatchObject({ costUsd: 0, unpricedTokens: 15 })
  })

  test('remembers message ids, running totals and the session', () => {
    const result = applyEntries(
      EMPTY_STATE,
      entries([message('m1'), cumulative('c1', detail({ input: 40 }))]),
    )

    expect(result.seen).toEqual({ m1: '2026-10-08' })
    expect(result.cumulative).toEqual({ c1: detail({ input: 40 }) })
    expect(result.sessions.s1).toMatchObject({ model: MODEL, context: null, day: '2026-10-08' })
    expect(result.sessions.s1?.totals.input).toBe(50)
  })

  test('does not change the state it was given', () => {
    const before = JSON.stringify(EMPTY_STATE)

    applyEntries(EMPTY_STATE, entries([message('m1')]))

    expect(JSON.stringify(EMPTY_STATE)).toBe(before)
  })
})

describe('withContext and withCursor', () => {
  test('keeps the session totals and model when only the context changes', () => {
    const state = applyEntries(EMPTY_STATE, entries([message('m1')]))

    const result = withContext(state, 's1', null, { tokens: 500, window: 1000 }, '2026-10-09')

    expect(result.sessions.s1).toMatchObject({
      model: MODEL,
      context: { tokens: 500, window: 1000 },
      day: '2026-10-09',
    })
    expect(result.sessions.s1?.totals).toEqual(state.sessions.s1?.totals)
  })

  test('starts an empty session record for a new session', () => {
    const result = withContext(EMPTY_STATE, 's9', null, null, '2026-10-09')

    expect(result.sessions.s9).toMatchObject({ model: null, context: null })
  })

  test('records a read position per file', () => {
    const cursor: Cursor = { offset: 42, carry: {}, day: '2026-10-09' }

    expect(withCursor(EMPTY_STATE, '/t.jsonl', cursor).cursors).toEqual({ '/t.jsonl': cursor })
  })
})

describe('prune', () => {
  /** One message, session and cursor per day, the session named after its day. */
  function stateOn(days: readonly string[]): UsageState {
    return days.reduce((state, day, index) => {
      const attribution = { ...ATTRIBUTION, sessionId: day }
      const found = entriesFor(state, [message(`m${index}`, {}, noon(day))], attribution, NOW)
      return withCursor(applyEntries(state, found), `/${day}.jsonl`, { offset: 1, carry: {}, day })
    }, EMPTY_STATE)
  }

  test('keeps what was touched on the oldest day and drops anything earlier', () => {
    const state = stateOn(['2026-09-08', '2026-09-09', '2026-09-10'])

    const result = prune(state, '2026-09-09')

    expect(Object.values(result.seen).sort()).toEqual(['2026-09-09', '2026-09-10'])
    expect(Object.keys(result.sessions).sort()).toEqual(['2026-09-09', '2026-09-10'])
    expect(Object.keys(result.cursors).sort()).toEqual(['/2026-09-09.jsonl', '/2026-09-10.jsonl'])
  })

  test('keeps every rollup row and running total, however old', () => {
    const state = stateOn(['2026-01-01', '2026-09-10'])

    const result = prune(state, '2026-09-01')

    expect(result.rows).toBe(state.rows)
    expect(result.cumulative).toBe(state.cumulative)
    expect(Object.keys(result.rows)).toHaveLength(2)
  })
})
