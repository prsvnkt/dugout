import { describe, expect, test } from 'vitest'
import type { Pane } from './layout'
import {
  forgetSession,
  forgetWorktreeSessions,
  MAX_RECENT_SESSIONS,
  rememberSession,
  titleFromPrompt,
  toRecentSession,
  type RecentSession,
} from './recentSessions'

const NOW = 1_700_000_000_000
const worktree = { path: '/repo/.worktrees/fix', branch: 'dugout/fix', name: 'fix' }

function pane(overrides: Partial<Pane> = {}): Pane {
  return { id: 'p1', kind: 'claude', generation: 0, sessionId: 's1', ...overrides }
}

function recent(sessionId: string, overrides: Partial<RecentSession> = {}): RecentSession {
  return { kind: 'claude', sessionId, closedAt: NOW, ...overrides }
}

describe('toRecentSession', () => {
  test('remembers an agent pane with its session, title, task and worktree', () => {
    const task = { number: 7, title: 'Fix login' }
    const closed = pane({ kind: 'codex', title: 'Fix login', task, worktree })

    expect(toRecentSession(closed, NOW)).toEqual({
      kind: 'codex',
      sessionId: 's1',
      closedAt: NOW,
      title: 'Fix login',
      task,
      worktree,
    })
  })

  test('skips shells and agents that never started a session', () => {
    const { sessionId: _unused, ...withoutSession } = pane()
    expect(toRecentSession(pane({ kind: 'shell' }), NOW)).toBeNull()
    expect(toRecentSession(withoutSession, NOW)).toBeNull()
  })
})

describe('recent session list', () => {
  test('puts the newest first and keeps each session once', () => {
    const list = rememberSession([recent('a'), recent('b')], recent('b', { closedAt: NOW + 1 }))

    expect(list.map((entry) => entry.sessionId)).toEqual(['b', 'a'])
    expect(list[0]?.closedAt).toBe(NOW + 1)
  })

  test(`keeps at most ${MAX_RECENT_SESSIONS} sessions`, () => {
    const full = Array.from({ length: MAX_RECENT_SESSIONS }, (_, index) => recent(`s${index}`))

    const list = rememberSession(full, recent('new'))

    expect(list).toHaveLength(MAX_RECENT_SESSIONS)
    expect(list[0]?.sessionId).toBe('new')
    expect(list.some((entry) => entry.sessionId === `s${MAX_RECENT_SESSIONS - 1}`)).toBe(false)
  })

  test('forgets a session, or every session in a removed worktree', () => {
    const list = [recent('a', { worktree }), recent('b'), recent('c', { worktree })]

    expect(forgetSession(list, 'b').map((entry) => entry.sessionId)).toEqual(['a', 'c'])
    expect(forgetWorktreeSessions(list, worktree.path).map((entry) => entry.sessionId)).toEqual([
      'b',
    ])
  })

  test('returns the same list when nothing is forgotten', () => {
    const list = [recent('a')]
    expect(forgetSession(list, 'missing')).toBe(list)
    expect(forgetWorktreeSessions(list, '/elsewhere')).toBe(list)
  })
})

describe('titleFromPrompt', () => {
  test('uses the first non-empty line, shortened', () => {
    expect(titleFromPrompt('\n  Fix the login bug  \nDetails here')).toBe('Fix the login bug')
    expect(titleFromPrompt('x'.repeat(200))).toHaveLength(80)
    expect(titleFromPrompt('x'.repeat(200)).endsWith('…')).toBe(true)
  })
})
