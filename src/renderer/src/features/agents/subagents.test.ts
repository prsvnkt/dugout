import { describe, expect, test } from 'vitest'
import type { SubagentUpdate } from '@shared/agentStatus'
import {
  applySubagentUpdate,
  clearFinished,
  MAX_TRACKED_SUBAGENTS,
  startsNewTurn,
  visibleSubagents,
} from './subagents'

const running = (id: string, type = 'Explore'): SubagentUpdate => ({ id, type, state: 'running' })
const done = (id: string, detail?: string): SubagentUpdate => ({
  id,
  type: 'Explore',
  state: 'done',
  ...(detail && { detail }),
})

describe('applySubagentUpdate', () => {
  test('adds a started subagent and marks it done with its reply when it stops', () => {
    const started = applySubagentUpdate([], running('a'))
    const stopped = applySubagentUpdate(started, done('a', 'Found 3 callers.'))

    expect(started).toEqual([running('a')])
    expect(stopped).toEqual([done('a', 'Found 3 callers.')])
  })

  test('a stop for a subagent it never saw start is added as done', () => {
    expect(applySubagentUpdate([running('a')], done('b'))).toEqual([running('a'), done('b')])
  })

  test('returns the same list when nothing changes', () => {
    const list = [running('a')]
    expect(applySubagentUpdate(list, running('a'))).toBe(list)
  })

  test('keeps at most a bounded number, dropping finished ones first', () => {
    const full = Array.from({ length: MAX_TRACKED_SUBAGENTS }, (_, i) =>
      i === 0 ? done('old') : running(`r${i}`),
    )
    const next = applySubagentUpdate(full, running('new'))
    expect(next).toHaveLength(MAX_TRACKED_SUBAGENTS)
    expect(next.map((s) => s.id)).not.toContain('old')
    expect(next.at(-1)?.id).toBe('new')
  })
})

describe('clearFinished', () => {
  test('drops finished subagents and keeps running ones', () => {
    expect(clearFinished([done('a'), running('b')])).toEqual([running('b')])
  })

  test('returns the same list when nothing finished', () => {
    const list = [running('a')]
    expect(clearFinished(list)).toBe(list)
  })
})

describe('startsNewTurn', () => {
  test('is true when an idle or finished agent starts working', () => {
    expect(startsNewTurn('idle', 'working')).toBe(true)
    expect(startsNewTurn('done', 'working')).toBe(true)
    expect(startsNewTurn('needs-input', 'working')).toBe(false)
    expect(startsNewTurn('working', 'working')).toBe(false)
    expect(startsNewTurn(null, 'working')).toBe(false)
  })
})

describe('visibleSubagents', () => {
  test('shows running subagents first, up to the limit, and counts the rest', () => {
    const list = [done('a'), running('b'), done('c'), running('d')]
    const { shown, hiddenCount } = visibleSubagents(list, 3)
    expect(shown.map((s) => s.id)).toEqual(['b', 'd', 'a'])
    expect(hiddenCount).toBe(1)
  })
})
