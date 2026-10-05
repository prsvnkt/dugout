import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { LayoutStore } from './LayoutStore'

function setup(dir = mkdtempSync(join(tmpdir(), 'dugout-layout-'))) {
  return { store: new LayoutStore({ filePath: join(dir, 'workspace.json') }), dir }
}

describe('LayoutStore', () => {
  test('starts empty without a file', async () => {
    expect(await setup().store.load(['p1'])).toEqual({ version: 1, projects: {} })
  })

  test('round-trips a snapshot', async () => {
    const { store, dir } = setup()
    const snapshot = {
      version: 1 as const,
      projects: { p1: { panes: [{ kind: 'claude' as const, sessionId: 's1' }] } },
    }
    await store.save(snapshot)
    expect(await setup(dir).store.load(['p1'])).toEqual(snapshot)
  })

  test('drops projects that no longer exist', async () => {
    const { store } = setup()
    await store.save({ version: 1, projects: { gone: { panes: [{ kind: 'shell' }] } } })
    expect(await store.load(['p1'])).toEqual({ version: 1, projects: {} })
  })

  test('drops panes whose worktree folder was deleted', async () => {
    const { store, dir } = setup()
    const alive = join(dir, 'alive')
    mkdirSync(alive)
    const worktree = (path: string) => ({ path, branch: 'dugout/x', name: 'x' })
    await store.save({
      version: 1,
      projects: {
        p1: {
          panes: [
            { kind: 'claude', worktree: worktree(alive) },
            { kind: 'claude', worktree: worktree(join(dir, 'deleted')) },
          ],
        },
      },
    })
    const loaded = await store.load(['p1'])
    expect(loaded.projects.p1?.panes.map((pane) => pane.worktree?.path)).toEqual([alive])
  })

  test('backs up a corrupt file and starts empty', async () => {
    const { store, dir } = setup()
    writeFileSync(join(dir, 'workspace.json'), 'nope')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await store.load(['p1'])).toEqual({ version: 1, projects: {} })
    expect(readdirSync(dir).some((file) => file.startsWith('workspace.json.corrupt-'))).toBe(true)
    warn.mockRestore()
  })
})
