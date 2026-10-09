import { beforeEach, describe, expect, test } from 'vitest'
import { ContextStore, type EntryFolder } from './ContextStore'

const PROJECT = { id: 'p1', rootPath: '/repo' }
const NOW = new Date('2026-10-09T10:00:00.000Z')

function memoryFolder(): EntryFolder & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    names: async () => [...files.keys()],
    read: async (name) => {
      const content = files.get(name)
      return content === undefined ? null : { content, modifiedAt: NOW.toISOString() }
    },
    write: async (name, content) => void files.set(name, content),
    remove: async (name) => void files.delete(name),
  }
}

let folders: Record<'shared' | 'private' | 'proposed', ReturnType<typeof memoryFolder>>
let hashes: Map<string, string>
let store: ContextStore

beforeEach(() => {
  folders = { shared: memoryFolder(), private: memoryFolder(), proposed: memoryFolder() }
  hashes = new Map([['src/auth.ts', 'h1']])
  store = new ContextStore({
    folder: (_project, kind) => folders[kind],
    hashPath: async (_root, path) => hashes.get(path) ?? null,
    now: () => NOW,
  })
})

describe('ContextStore', () => {
  test('saves shared notes to the shared folder and private ones apart', async () => {
    await store.add(PROJECT, { kind: 'note', scope: 'shared', title: 'Deploys', body: 'Fridays' })
    await store.add(PROJECT, { kind: 'note', scope: 'private', title: 'Mine', body: 'x' })

    expect([...folders.shared.files.keys()]).toEqual(['deploys.md'])
    expect([...folders.private.files.keys()]).toEqual(['mine.md'])
    const { entries } = await store.read(PROJECT)
    expect(entries.map((entry) => [entry.id, entry.scope])).toEqual([
      ['deploys', 'shared'],
      ['mine', 'private'],
    ])
  })

  test('gives each entry its own id, even across scopes and proposals', async () => {
    await store.add(PROJECT, { kind: 'note', scope: 'shared', title: 'Setup', body: '' })
    await store.propose(PROJECT, { title: 'Setup', body: 'b' }, null)
    const third = await store.add(PROJECT, {
      kind: 'note',
      scope: 'private',
      title: 'Setup',
      body: '',
    })
    expect(third.id).toBe('setup-3')
  })

  test('marks a pinned file stale when it changes, missing when it is gone', async () => {
    await store.add(PROJECT, {
      kind: 'file',
      scope: 'shared',
      title: 'Auth',
      body: '',
      path: 'src/auth.ts',
    })
    expect((await store.get(PROJECT, 'auth'))?.pin).toBe('current')

    hashes.set('src/auth.ts', 'h2')
    expect((await store.get(PROJECT, 'auth'))?.pin).toBe('stale')

    await store.repin(PROJECT, 'auth')
    expect((await store.get(PROJECT, 'auth'))?.pin).toBe('current')

    hashes.delete('src/auth.ts')
    expect((await store.get(PROJECT, 'auth'))?.pin).toBe('missing')
  })

  test('refuses to pin a path that does not exist', async () => {
    await expect(
      store.add(PROJECT, { kind: 'file', scope: 'shared', title: 'X', body: '', path: 'nope' }),
    ).rejects.toThrow('does not exist')
  })

  test('agent notes wait as proposals until approved, then become shared notes', async () => {
    const proposal = await store.propose(PROJECT, { title: 'Tests', body: 'Need Docker' }, 'codex')
    expect((await store.read(PROJECT)).entries).toEqual([])
    expect(folders.shared.files.size).toBe(0)

    const entry = await store.approve(PROJECT, proposal.id)

    expect(entry).toMatchObject({ id: 'tests', kind: 'note', scope: 'shared', body: 'Need Docker' })
    expect(folders.shared.files.get('tests.md')).toContain('Need Docker')
    expect(await store.proposals(PROJECT)).toEqual([])
  })

  test('discarding a proposal shares nothing', async () => {
    const proposal = await store.propose(PROJECT, { title: 'Wrong', body: 'x' }, 'claude')
    await store.discard(PROJECT, proposal.id)
    expect(await store.read(PROJECT)).toEqual({ entries: [], proposals: [] })
  })

  test('edits keep the kind and scope; removing deletes the file', async () => {
    await store.add(PROJECT, {
      kind: 'link',
      scope: 'private',
      title: 'Docs',
      body: '',
      url: 'https://x.dev',
    })

    const edited = await store.edit(PROJECT, { id: 'docs', title: 'API docs', body: 'v2' })
    expect(edited).toMatchObject({
      kind: 'link',
      scope: 'private',
      title: 'API docs',
      url: 'https://x.dev',
    })

    await store.remove(PROJECT, 'docs')
    expect(folders.private.files.size).toBe(0)
  })

  test('a project has one codemap, replaced on every build', async () => {
    await store.saveCodemap(PROJECT, 'claude', 'v1')
    await store.saveCodemap(PROJECT, 'claude', 'v2')
    const entries = (await store.read(PROJECT)).entries
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ id: 'codemap', kind: 'codemap', body: 'v2\n' })
  })

  test('a shared entry hides a private one with the same id', async () => {
    folders.shared.files.set('same.md', '# Shared')
    folders.private.files.set('same.md', '# Private')
    folders.shared.files.set('ignored.txt', 'not an entry')
    const entries = (await store.read(PROJECT)).entries
    expect(entries.map((entry) => entry.title)).toEqual(['Shared'])
  })
})
