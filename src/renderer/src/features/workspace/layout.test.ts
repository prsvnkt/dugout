import { describe, expect, test } from 'vitest'
import {
  addPane,
  clearInitialPrompt,
  closePane,
  closeWorktreePanes,
  EMPTY_LAYOUT,
  focusPane,
  restartPane,
  setPaneSession,
  type ProjectLayout,
} from './layout'

let nextId = 0
const createId = () => `pane${++nextId}`

function idAt(layout: ProjectLayout, index: number): string {
  const pane = layout.panes[index]
  if (!pane) throw new Error(`No pane at index ${index}`)
  return pane.id
}

describe('workspace layout', () => {
  test('adding a pane appends it and focuses it', () => {
    const one = addPane(EMPTY_LAYOUT, 'claude', createId)
    const two = addPane(one, 'shell', createId)

    expect(two.panes.map((pane) => pane.kind)).toEqual(['claude', 'shell'])
    expect(two.focusedPaneId).toBe(two.panes[1]?.id)
  })

  test('adding never mutates the previous layout', () => {
    const one = addPane(EMPTY_LAYOUT, 'claude', createId)
    addPane(one, 'shell', createId)
    expect(one.panes).toHaveLength(1)
    expect(EMPTY_LAYOUT.panes).toHaveLength(0)
  })

  test('closing the focused pane focuses its neighbour', () => {
    let layout: ProjectLayout = EMPTY_LAYOUT
    layout = addPane(layout, 'claude', createId)
    layout = addPane(layout, 'shell', createId)
    layout = addPane(layout, 'shell', createId)
    const [first, second, third] = [idAt(layout, 0), idAt(layout, 1), idAt(layout, 2)]

    const afterMiddle = closePane(focusPane(layout, second), second)
    expect(afterMiddle.panes.map((p) => p.id)).toEqual([first, third])
    expect(afterMiddle.focusedPaneId).toBe(third)

    const afterLast = closePane(afterMiddle, third)
    expect(afterLast.focusedPaneId).toBe(first)
  })

  test('closing an unfocused pane keeps focus where it was', () => {
    let layout: ProjectLayout = EMPTY_LAYOUT
    layout = addPane(layout, 'claude', createId)
    layout = addPane(layout, 'shell', createId)
    expect(closePane(layout, idAt(layout, 0)).focusedPaneId).toBe(idAt(layout, 1))
  })

  test('closing the last pane leaves nothing focused', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    expect(closePane(layout, idAt(layout, 0))).toEqual(EMPTY_LAYOUT)
  })

  test('focusing an unknown pane is a no-op', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    expect(focusPane(layout, 'missing')).toBe(layout)
  })

  test('caps the number of panes per project', () => {
    let layout: ProjectLayout = EMPTY_LAYOUT
    for (let i = 0; i < 10; i++) layout = addPane(layout, 'shell', createId)
    expect(layout.panes).toHaveLength(6)
  })
})

describe('worktree panes', () => {
  test('a pane can run in a worktree', () => {
    const worktree = { path: '/wt/s1', branch: 'dugout/s1', name: 's1' }
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId, worktree)
    expect(layout.panes[0]).toMatchObject({ kind: 'claude', worktree })
  })

  test('closing every pane in a worktree leaves the others', () => {
    const worktree = { path: '/wt/s1', branch: 'dugout/s1', name: 's1' }
    let layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    layout = addPane(layout, 'claude', createId, worktree)
    layout = addPane(layout, 'shell', createId, worktree)

    const after = closeWorktreePanes(layout, '/wt/s1')

    expect(after.panes).toHaveLength(1)
    expect(after.panes[0]?.worktree).toBeUndefined()
    expect(after.focusedPaneId).toBe(after.panes[0]?.id)
  })
})

describe('pane sessions', () => {
  test('remembers the latest Claude session of a pane', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    const id = idAt(layout, 0)
    expect(setPaneSession(layout, id, 's1').panes[0]?.sessionId).toBe('s1')
  })

  test('a fresh restart forgets the session, e.g. when resuming it failed', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    const id = idAt(layout, 0)
    const restarted = restartPane(setPaneSession(layout, id, 's1'), id, { isFresh: true })
    expect(restarted.panes[0]?.sessionId).toBeUndefined()
    expect(restarted.panes[0]?.generation).toBe(1)
  })

  test('restarting a pane bumps its generation so it remounts', () => {
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId)
    const id = idAt(layout, 0)
    const restarted = restartPane(restartPane(layout, id), id)
    expect(restarted.panes[0]?.generation).toBe(2)
    expect(layout.panes[0]?.generation).toBe(0)
  })
})

describe('unchanged updates', () => {
  test('setting the same session id returns the same layout, so stores do not re-render', () => {
    const layout = setPaneSession(addPane(EMPTY_LAYOUT, 'claude', createId), 'pane-x', 's1')
    const withSession = setPaneSession(layout, idAt(layout, 0), 's1')
    expect(setPaneSession(withSession, idAt(withSession, 0), 's1')).toBe(withSession)
  })
})

describe('task panes', () => {
  test('a pane can be started for a task with a first prompt, which is used once', () => {
    const task = { number: 42, title: 'Fix login' }
    const layout = addPane(EMPTY_LAYOUT, 'claude', createId, undefined, {
      task,
      initialPrompt: 'Work on #42',
    })
    const id = idAt(layout, 0)
    expect(layout.panes[0]).toMatchObject({ task, initialPrompt: 'Work on #42' })

    const started = clearInitialPrompt(layout, id)
    expect(started.panes[0]?.initialPrompt).toBeUndefined()
    expect(started.panes[0]?.task).toEqual(task)
    expect(clearInitialPrompt(started, id)).toBe(started)
  })
})
