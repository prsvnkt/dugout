import { describe, expect, test, vi } from 'vitest'
import type { ContextEntryView, ContextProposal } from '@shared/context'
import { handleContextRpc, type ContextCaller, type ContextRpcStore } from './contextRpc'

const CALLER: ContextCaller = { project: { id: 'p1', rootPath: '/repo' }, agent: 'claude' }
const base = { scope: 'shared' as const, updatedAt: '2026-10-09T00:00:00.000Z' }
const ENTRIES: ContextEntryView[] = [
  {
    ...base,
    id: 'auth',
    kind: 'file',
    title: 'Auth',
    body: 'Uses Redis',
    path: 'src/auth',
    hash: 'h',
    pin: 'stale',
  },
  { ...base, id: 'map', kind: 'codemap', title: 'Codemap', body: '- src/', agent: 'claude' },
]

function fakeStore(): ContextRpcStore & { propose: ReturnType<typeof vi.fn> } {
  return {
    entries: vi.fn(async () => ENTRIES),
    get: vi.fn(async (_project, id: string) => ENTRIES.find((entry) => entry.id === id) ?? null),
    propose: vi.fn(
      async (_project, note: { title: string; body: string }): Promise<ContextProposal> => ({
        id: 'tests',
        ...note,
        proposedBy: 'claude',
        createdAt: base.updatedAt,
      }),
    ),
  }
}

const call = (store: ContextRpcStore, method: string, params: unknown, onProposed = vi.fn()) =>
  handleContextRpc(store, CALLER, method, params, onProposed)

describe('handleContextRpc', () => {
  test('list is a small index: no bodies or hashes', async () => {
    const result = (await call(fakeStore(), 'context.list', {})) as { entries: object[] }
    expect(result.entries).toEqual([
      { id: 'auth', kind: 'file', title: 'Auth', scope: 'shared', path: 'src/auth', pin: 'stale' },
      { id: 'map', kind: 'codemap', title: 'Codemap', scope: 'shared' },
    ])
    expect(JSON.stringify(result)).not.toContain('Redis')
  })

  test('get returns the body, and says how to find ids when one is unknown', async () => {
    expect(await call(fakeStore(), 'context.get', { id: 'map' })).toMatchObject({
      body: '- src/',
      builtBy: 'claude',
    })
    await expect(call(fakeStore(), 'context.get', { id: 'nope' })).rejects.toThrow('list_context')
  })

  test('search finds entries by their words', async () => {
    const result = (await call(fakeStore(), 'context.search', { query: 'redis' })) as {
      hits: { id: string }[]
    }
    expect(result.hits.map((hit) => hit.id)).toEqual(['auth'])
  })

  test('add_note is only a proposal, from the calling agent, and tells the UI', async () => {
    const store = fakeStore()
    const onProposed = vi.fn()

    const result = await call(
      store,
      'context.addNote',
      { title: 'Tests', body: 'Need Docker' },
      onProposed,
    )

    expect(store.propose).toHaveBeenCalledWith(
      CALLER.project,
      { title: 'Tests', body: 'Need Docker' },
      'claude',
    )
    expect(result).toMatchObject({ id: 'tests', status: 'proposed' })
    expect(onProposed).toHaveBeenCalledOnce()
  })

  test('validates arguments and refuses unknown methods', async () => {
    await expect(call(fakeStore(), 'context.get', { id: '../etc/passwd' })).rejects.toThrow()
    await expect(call(fakeStore(), 'context.addNote', { title: '', body: 'x' })).rejects.toThrow()
    await expect(call(fakeStore(), 'context.drop', {})).rejects.toThrow('Unknown')
  })
})
