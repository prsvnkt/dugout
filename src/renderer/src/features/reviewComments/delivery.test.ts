import { describe, expect, it } from 'vitest'
import type { Pane, ProjectLayout } from '@renderer/features/workspace/layout'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'
import { chooseDelivery } from './delivery'

const WORKTREE = { path: '/data/worktrees/p/1', branch: 'dugout/1', name: '1' }

const pane = (id: string, extras: Partial<Pane> = {}): Pane => ({
  id,
  kind: 'claude',
  generation: 0,
  ...extras,
})

function inputs(
  panes: readonly Pane[],
  activities: Record<string, PaneActivity>,
  {
    focusedPaneId = null,
    worktreePath = null,
  }: { focusedPaneId?: string | null; worktreePath?: string | null } = {},
) {
  const layout: ProjectLayout = { panes, focusedPaneId }
  const terminalIds = Object.fromEntries(panes.map((p) => [p.id, `term-${p.id}`]))
  return { layout, activities, terminalIds, worktreePath }
}

describe('chooseDelivery', () => {
  it('offers to start an agent when none runs on the checkout', () => {
    // Arrange: a shell on main, and an agent in another worktree
    const panes = [pane('shell', { kind: 'shell' }), pane('wt', { worktree: WORKTREE })]

    // Act
    const delivery = chooseDelivery(inputs(panes, { shell: 'running', wt: 'idle' }))

    // Assert
    expect(delivery).toEqual({ kind: 'start' })
  })

  it('sends to the agent running in the commented worktree', () => {
    const panes = [pane('main'), pane('wt', { worktree: WORKTREE })]

    const delivery = chooseDelivery(
      inputs(panes, { main: 'idle', wt: 'done' }, { worktreePath: WORKTREE.path }),
    )

    expect(delivery).toEqual({ kind: 'send', paneId: 'wt', terminalId: 'term-wt' })
  })

  it('prefers the focused agent, else the newest', () => {
    const panes = [pane('a'), pane('b'), pane('c', { kind: 'codex' })]
    const activities = { a: 'idle', b: 'idle', c: 'working' } as const

    expect(chooseDelivery(inputs(panes, activities, { focusedPaneId: 'a' }))).toMatchObject({
      paneId: 'a',
    })
    expect(chooseDelivery(inputs(panes, activities))).toMatchObject({ paneId: 'c' })
  })

  it('skips agents that exited', () => {
    const delivery = chooseDelivery(inputs([pane('a')], { a: 'exited' }))

    expect(delivery).toEqual({ kind: 'start' })
  })

  it('holds back while the agent waits for an answer or is still starting', () => {
    expect(chooseDelivery(inputs([pane('a')], { a: 'needs-input' }))).toMatchObject({
      kind: 'busy',
      paneId: 'a',
    })
    expect(chooseDelivery(inputs([pane('a')], { a: 'starting' }))).toMatchObject({ kind: 'busy' })
  })
})
