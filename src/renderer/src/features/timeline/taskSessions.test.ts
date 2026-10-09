import { describe, expect, test } from 'vitest'
import type { Pane } from '@renderer/features/workspace/layout'
import type { RecentSession } from '@renderer/features/workspace/recentSessions'
import { taskSessions } from './taskSessions'

const task = { number: 7, key: 'ENG-7', title: 'Fix login' }

function pane(id: string, kind: Pane['kind'], extras: Partial<Pane> = {}): Pane {
  return { id, kind, generation: 0, ...extras }
}

describe('taskSessions', () => {
  test("lists a task's open agents, then its closed sessions, numbering repeats", () => {
    // Arrange
    const panes = [
      pane('a', 'claude', { task, sessionId: 's-1' }),
      pane('b', 'codex', { task, sessionId: 's-2' }),
      pane('c', 'claude', { task, sessionId: 's-3' }),
    ]
    const recent: RecentSession[] = [{ kind: 'claude', sessionId: 's-4', closedAt: 1, task }]

    // Act
    const sessions = taskSessions(panes, recent, 7)

    // Assert
    expect(sessions).toEqual([
      { agent: 'claude', sessionId: 's-1', label: 'Claude' },
      { agent: 'codex', sessionId: 's-2', label: 'Codex' },
      { agent: 'claude', sessionId: 's-3', label: 'Claude 2' },
      { agent: 'claude', sessionId: 's-4', label: 'Claude 3 (closed)' },
    ])
  })

  test('leaves out other tasks, shells, unstarted agents, repeats and agents without timelines', () => {
    const panes = [
      pane('a', 'claude', { task: { ...task, number: 8 }, sessionId: 's-1' }),
      pane('b', 'shell', { task }),
      pane('c', 'claude', { task }),
      pane('d', 'opencode', { task, sessionId: 's-5' }),
      pane('e', 'codex', { task, sessionId: 's-2' }),
    ]
    const recent: RecentSession[] = [{ kind: 'codex', sessionId: 's-2', closedAt: 1, task }]
    expect(taskSessions(panes, recent, 7)).toEqual([
      { agent: 'codex', sessionId: 's-2', label: 'Codex' },
    ])
  })
})
