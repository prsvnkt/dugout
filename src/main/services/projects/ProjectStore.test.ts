import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectStore } from './ProjectStore'

const REPO = '/Users/me/bene'

function setup(dir = mkdtempSync(join(tmpdir(), 'dugout-store-'))) {
  let nextId = 0
  const store = new ProjectStore({
    filePath: join(dir, 'projects.json'),
    createId: () => `p${++nextId}`,
    now: () => new Date('2026-10-05T12:00:00Z'),
    resolveRepoRoot: async (path) => (path.startsWith(REPO) ? REPO : null),
  })
  return { store, dir }
}

describe('ProjectStore', () => {
  let ctx: ReturnType<typeof setup>

  beforeEach(async () => {
    ctx = setup()
    await ctx.store.load()
  })

  test('starts empty when no file exists', () => {
    expect(ctx.store.list()).toEqual([])
  })

  test('adds a project at the repository root', async () => {
    const project = await ctx.store.add({ name: 'Bene', rootPath: `${REPO}/src`, color: 'teal' })

    expect(project).toEqual({
      id: 'p1',
      name: 'Bene',
      rootPath: REPO,
      color: 'teal',
      createdAt: '2026-10-05T12:00:00.000Z',
    })
    expect(ctx.store.list()).toEqual([project])
  })

  test('rejects a folder that is not a git repository', async () => {
    await expect(
      ctx.store.add({ name: 'X', rootPath: '/Users/me/notes', color: 'teal' }),
    ).rejects.toThrow('not inside a git repository')
  })

  test('rejects adding the same repository twice', async () => {
    await ctx.store.add({ name: 'Bene', rootPath: REPO, color: 'teal' })
    await expect(ctx.store.add({ name: 'Again', rootPath: REPO, color: 'blue' })).rejects.toThrow(
      'already added',
    )
  })

  test('persists projects so a new store can load them', async () => {
    const project = await ctx.store.add({ name: 'Bene', rootPath: REPO, color: 'teal' })

    const reloaded = setup(ctx.dir).store
    await reloaded.load()

    expect(reloaded.list()).toEqual([project])
  })

  test('updates name and colour without mutating earlier snapshots', async () => {
    const project = await ctx.store.add({ name: 'Bene', rootPath: REPO, color: 'teal' })
    const before = ctx.store.list()

    const updated = await ctx.store.update(project.id, { name: 'Bene API', color: 'purple' })

    expect(updated).toMatchObject({ name: 'Bene API', color: 'purple', rootPath: REPO })
    expect(before[0]?.name).toBe('Bene')
  })

  test('update rejects an unknown id', async () => {
    await expect(ctx.store.update('missing', { name: 'X' })).rejects.toThrow('not found')
  })

  test('removes a project', async () => {
    const project = await ctx.store.add({ name: 'Bene', rootPath: REPO, color: 'teal' })
    await ctx.store.remove(project.id)
    expect(ctx.store.list()).toEqual([])
  })

  test('writes the file atomically, leaving no temp files behind', async () => {
    await ctx.store.add({ name: 'Bene', rootPath: REPO, color: 'teal' })
    expect(readdirSync(ctx.dir)).toEqual(['projects.json'])
    expect(JSON.parse(readFileSync(join(ctx.dir, 'projects.json'), 'utf8'))).toMatchObject({
      version: 1,
    })
  })

  test('backs up a corrupt file and starts empty instead of crashing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dugout-store-'))
    writeFileSync(join(dir, 'projects.json'), '{ not json')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { store } = setup(dir)
    await store.load()

    expect(store.list()).toEqual([])
    expect(readdirSync(dir).some((file) => file.startsWith('projects.json.corrupt-'))).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
