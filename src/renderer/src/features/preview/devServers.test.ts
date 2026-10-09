import { describe, expect, test } from 'vitest'
import type { Pane, ProjectLayout } from '@renderer/features/workspace/layout'
import { devServerPane, reservedPorts } from './devServers'

const WORKTREE = { path: '/data/worktrees/a1', branch: 'dugout/a1', name: 'a1' }

function pane(id: string, extra: Partial<Pane> = {}): Pane {
  return { id, kind: 'shell', generation: 0, ...extra }
}

function layout(...panes: Pane[]): ProjectLayout {
  return { panes, focusedPaneId: panes[0]?.id ?? null }
}

describe('devServerPane', () => {
  const mainServer = pane('main', { devServer: { command: 'npm run dev', port: 4100 } })
  const worktreeServer = pane('wt', {
    worktree: WORKTREE,
    devServer: { command: 'npm run dev', port: 4101 },
  })
  const plainShell = pane('plain')

  test('finds the dev server of the main checkout', () => {
    expect(devServerPane(layout(plainShell, worktreeServer, mainServer), null)).toBe(mainServer)
  })

  test('finds the dev server of a worktree', () => {
    expect(devServerPane(layout(mainServer, worktreeServer), WORKTREE.path)).toBe(worktreeServer)
  })

  test('ignores plain shells and other checkouts', () => {
    expect(devServerPane(layout(plainShell, worktreeServer), null)).toBeNull()
    expect(devServerPane(layout(mainServer), WORKTREE.path)).toBeNull()
    expect(devServerPane(undefined, null)).toBeNull()
  })
})

describe('reservedPorts', () => {
  test('collects the ports of dev servers in every project', () => {
    const layouts = {
      p1: layout(pane('a', { devServer: { command: 'a', port: 4100 } }), pane('b')),
      p2: layout(pane('c', { devServer: { command: 'c', port: 4105 } })),
    }

    expect(reservedPorts(layouts)).toEqual([4100, 4105])
  })

  test('is empty without dev servers', () => {
    expect(reservedPorts({ p1: layout(pane('a')) })).toEqual([])
  })
})
