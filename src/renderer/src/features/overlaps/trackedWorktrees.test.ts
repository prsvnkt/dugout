import { describe, expect, test } from 'vitest'
import type { Pane } from '@renderer/features/workspace/layout'
import { liveWorktreePaths, trackWorktrees, worktreeLabel } from './trackedWorktrees'

const worktree = (name: string) => ({ path: `/wt/${name}`, branch: `dugout/${name}`, name })

const panes: Pane[] = [
  {
    id: 'p1',
    kind: 'claude',
    generation: 0,
    worktree: worktree('12-login-claude'),
    task: { number: 12, title: 'Login' },
  },
  { id: 'p2', kind: 'codex', generation: 0, worktree: worktree('k3x9') },
  { id: 'p3', kind: 'shell', generation: 0, worktree: worktree('s1') },
  { id: 'p4', kind: 'claude', generation: 0 },
]

describe('liveWorktreePaths', () => {
  test('joins listed worktrees and those open agents run in, once each, sorted', () => {
    expect(liveWorktreePaths([worktree('old'), worktree('k3x9')], panes)).toEqual([
      '/wt/12-login-claude',
      '/wt/k3x9',
      '/wt/old',
      '/wt/s1',
    ])
  })
})

describe('trackWorktrees', () => {
  test('keeps the file paths and the task of each worktree', () => {
    const tracked = trackWorktrees(
      [
        { worktreePath: '/wt/12-login-claude', changes: [{ path: 'a.ts', kind: 'modified' }] },
        { worktreePath: '/wt/k3x9', changes: [{ path: 'b.ts', kind: 'added' }] },
      ],
      panes,
    )
    expect(tracked).toEqual([
      { worktreePath: '/wt/12-login-claude', files: ['a.ts'], taskNumber: 12 },
      { worktreePath: '/wt/k3x9', files: ['b.ts'], taskNumber: undefined },
    ])
  })
})

describe('worktreeLabel', () => {
  const listed = [worktree('old')]

  test('names a worktree by its task', () => {
    expect(worktreeLabel('/wt/12-login-claude', panes, listed)).toBe('#12')
  })

  test('falls back to the agent and worktree name', () => {
    expect(worktreeLabel('/wt/k3x9', panes, listed)).toBe('Codex (k3x9)')
  })

  test('uses the worktree name when no agent runs there', () => {
    expect(worktreeLabel('/wt/s1', panes, listed)).toBe('s1')
    expect(worktreeLabel('/wt/old', panes, listed)).toBe('old')
    expect(worktreeLabel('/elsewhere/gone', panes, listed)).toBe('gone')
  })
})
