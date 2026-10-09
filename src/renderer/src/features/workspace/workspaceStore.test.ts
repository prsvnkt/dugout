import '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test } from 'vitest'
import type { WorkspaceSnapshot } from '@shared/ipc/contract'
import { useWorkspaceStore } from './workspaceStore'

const PROJECT = 'project-1'
const OTHER = 'project-2'
const initial = useWorkspaceStore.getState()

const store = () => useWorkspaceStore.getState()
const panesOf = (projectId: string) => store().layouts[projectId]?.panes ?? []

function addAgent(projectId = PROJECT, sessionId = 's1'): string {
  store().addPane(projectId, 'claude', undefined, { sessionId, title: 'Fix login' })
  const pane = panesOf(projectId).at(-1)
  if (!pane) throw new Error('no pane added')
  return pane.id
}

beforeEach(() => {
  useWorkspaceStore.setState(initial, true)
})

describe('setters leave state alone when nothing changes', () => {
  test('setActivity with the same activity and detail returns the identical state', () => {
    // Arrange
    const paneId = addAgent()
    store().setActivity(paneId, 'working', 'Editing a file')
    const before = store()

    // Act
    store().setActivity(paneId, 'working', 'Editing a file')

    // Assert
    expect(store()).toBe(before)
  })

  test('setActivity with a new detail keeps the time the activity started', () => {
    // Arrange
    const paneId = addAgent()
    store().setActivity(paneId, 'working', 'first')
    const since = store().details[paneId]?.since

    // Act
    store().setActivity(paneId, 'working', 'second')

    // Assert
    expect(store().details[paneId]).toMatchObject({ detail: 'second', since })
  })

  test('setSubagents with the same list, or an empty list for a pane without one, changes nothing', () => {
    // Arrange
    const paneId = addAgent()
    const list = [{ id: 'a', type: 'Explore', state: 'running' as const }]
    store().setSubagents(paneId, list)
    const before = store()

    // Act
    store().setSubagents(paneId, list)
    store().setSubagents('other-pane', [])

    // Assert
    expect(store()).toBe(before)
  })

  test('setTerminalId with the same id, or null for a pane without one, changes nothing', () => {
    // Arrange
    const paneId = addAgent()
    store().setTerminalId(paneId, 'terminal-1')
    const before = store()

    // Act
    store().setTerminalId(paneId, 'terminal-1')
    store().setTerminalId('other-pane', null)

    // Assert
    expect(store()).toBe(before)
  })

  test('setFocusedArea with the same area changes nothing', () => {
    // Arrange
    store().setFocusedArea(PROJECT, 'editor')
    const before = store()

    // Act
    store().setFocusedArea(PROJECT, 'editor')

    // Assert
    expect(store()).toBe(before)
  })

  test('selectCheckout with the same checkout changes nothing', () => {
    // Arrange
    store().selectCheckout(PROJECT, '/repo/.worktrees/a')
    const before = store()

    // Act
    store().selectCheckout(PROJECT, '/repo/.worktrees/a')

    // Assert
    expect(store()).toBe(before)
  })

  test('focusing the already focused pane changes nothing', () => {
    // Arrange
    const paneId = addAgent()
    store().focusPane(PROJECT, paneId)
    const before = store()

    // Act
    store().focusPane(PROJECT, paneId)

    // Assert
    expect(store()).toBe(before)
  })

  test('markRestored a second time changes nothing', () => {
    // Arrange
    store().markRestored()
    const before = store()

    // Act
    store().markRestored()

    // Assert
    expect(store()).toBe(before)
    expect(before.isRestored).toBe(true)
  })
})

describe('closePane', () => {
  test('remembers a closed agent session and forgets its runtime state', () => {
    // Arrange
    const paneId = addAgent(PROJECT, 'session-9')
    store().setActivity(paneId, 'done')
    store().setTerminalId(paneId, 'terminal-1')
    store().setSubagents(paneId, [{ id: 'a', type: 'Explore', state: 'done' }])

    // Act
    store().closePane(PROJECT, paneId)

    // Assert
    expect(panesOf(PROJECT)).toEqual([])
    expect(store().recentSessions[PROJECT]).toEqual([
      expect.objectContaining({ kind: 'claude', sessionId: 'session-9', title: 'Fix login' }),
    ])
    expect(store().activities[paneId]).toBeUndefined()
    expect(store().terminalIds[paneId]).toBeUndefined()
    expect(store().subagents[paneId]).toBeUndefined()
  })

  test('does not remember a shell', () => {
    // Arrange
    store().addPane(PROJECT, 'shell')
    const shellId = panesOf(PROJECT)[0]?.id ?? ''

    // Act
    store().closePane(PROJECT, shellId)

    // Assert
    expect(store().recentSessions[PROJECT] ?? []).toEqual([])
  })

  test('resumeSession reopens a closed session and takes it off the list', () => {
    // Arrange
    store().closePane(PROJECT, addAgent(PROJECT, 'session-9'))

    // Act
    store().resumeSession(PROJECT, 'session-9')

    // Assert
    expect(panesOf(PROJECT)).toEqual([expect.objectContaining({ sessionId: 'session-9' })])
    expect(store().recentSessions[PROJECT]).toEqual([])
  })
})

describe('hydrate', () => {
  const snapshot: WorkspaceSnapshot = {
    version: 1,
    projects: {
      [PROJECT]: {
        panes: [{ kind: 'shell' }, { kind: 'claude', sessionId: 's1', title: 'Fix login' }],
        recent: [{ kind: 'codex', sessionId: 's0', closedAt: 1 }],
      },
    },
  }

  test('restores saved panes with fresh ids, focusing the last one, and marks the workspace restored', () => {
    // Act
    store().hydrate(snapshot)
    const first = panesOf(PROJECT).map((pane) => pane.id)
    store().hydrate(snapshot)
    const second = panesOf(PROJECT).map((pane) => pane.id)

    // Assert
    expect(panesOf(PROJECT)).toEqual([
      expect.objectContaining({ kind: 'shell', generation: 0 }),
      expect.objectContaining({ kind: 'claude', sessionId: 's1', title: 'Fix login' }),
    ])
    expect(new Set([...first, ...second]).size).toBe(4)
    expect(store().layouts[PROJECT]?.focusedPaneId).toBe(second[1])
    expect(store().recentSessions[PROJECT]).toEqual([
      { kind: 'codex', sessionId: 's0', closedAt: 1 },
    ])
    expect(store().isRestored).toBe(true)
  })

  test('the workspace is not restored until hydrate or markRestored runs', () => {
    // Assert
    expect(store().isRestored).toBe(false)
  })
})

describe('removeProject', () => {
  test('clears every per-project and per-pane map and leaves other projects alone', () => {
    // Arrange
    const paneId = addAgent(PROJECT, 'gone')
    const keptId = addAgent(OTHER, 'kept')
    store().closePane(PROJECT, addAgent(PROJECT, 'closed'))
    for (const id of [paneId, keptId]) {
      store().setActivity(id, 'needs-input', 'Allow Bash?')
      store().setTerminalId(id, `terminal-${id}`)
      store().setSubagents(id, [{ id: 'a', type: 'Explore', state: 'running' }])
      store().revealPane(id === paneId ? PROJECT : OTHER, id)
    }
    store().selectCheckout(PROJECT, '/repo/.worktrees/a')
    store().setFocusedArea(PROJECT, 'editor')

    // Act
    store().removeProject(PROJECT)

    // Assert
    const state = store()
    expect(state.layouts[PROJECT]).toBeUndefined()
    expect(state.recentSessions[PROJECT]).toBeUndefined()
    expect(state.gitCheckouts[PROJECT]).toBeUndefined()
    expect(state.focusedAreas[PROJECT]).toBeUndefined()
    for (const map of [
      state.activities,
      state.terminalIds,
      state.subagents,
      state.details,
      state.focusRequests,
    ]) {
      expect(map[paneId]).toBeUndefined()
      expect(map[keptId]).toBeDefined()
    }
    expect(panesOf(OTHER)).toHaveLength(1)
  })
})

describe('findTerminal', () => {
  test('finds the project and pane running a terminal', () => {
    // Arrange
    const paneId = addAgent()
    store().setTerminalId(paneId, 'terminal-1')

    // Act / Assert
    expect(store().findTerminal('terminal-1')).toEqual({ projectId: PROJECT, paneId })
    expect(store().findTerminal('missing')).toBeNull()
  })
})
