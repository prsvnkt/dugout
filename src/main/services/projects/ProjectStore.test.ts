import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { ProjectStore } from './ProjectStore'

const REPO = '/Users/me/bene'

const OTHER = '/Users/me/rayna'

function setup(dir = mkdtempSync(join(tmpdir(), 'dugout-store-'))) {
  let nextId = 0
  const store = new ProjectStore({
    filePath: join(dir, 'projects.json'),
    createId: () => `p${++nextId}`,
    now: () => new Date('2026-10-05T12:00:00Z'),
    // Always the first candidate, so colours are predictable in tests.
    random: () => 0,
    resolveRepoRoot: async (path) => [REPO, OTHER].find((root) => path.startsWith(root)) ?? null,
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

  test('adds a project at the repository root, named after its folder', async () => {
    const project = await ctx.store.add({ rootPath: `${REPO}/src` })

    expect(project).toEqual({
      id: 'p1',
      name: 'bene',
      rootPath: REPO,
      color: 'blue',
      createdAt: '2026-10-05T12:00:00.000Z',
    })
    expect(ctx.store.list()).toEqual([project])
  })

  test('gives each new project a colour no other project uses', async () => {
    const first = await ctx.store.add({ rootPath: REPO })
    const second = await ctx.store.add({ rootPath: OTHER })

    expect(second.color).not.toBe(first.color)
  })

  test('rejects a folder that is not a git repository', async () => {
    await expect(ctx.store.add({ rootPath: '/Users/me/notes' })).rejects.toThrow(
      'not inside a git repository',
    )
  })

  test('rejects adding the same repository twice', async () => {
    await ctx.store.add({ rootPath: REPO })
    await expect(ctx.store.add({ rootPath: `${REPO}/src` })).rejects.toThrow('already added')
  })

  test('persists projects so a new store can load them', async () => {
    const project = await ctx.store.add({ rootPath: REPO })

    const reloaded = setup(ctx.dir).store
    await reloaded.load()

    expect(reloaded.list()).toEqual([project])
  })

  test('names projects saved with a custom name after their folder again', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dugout-store-'))
    const saved = {
      id: 'p1',
      name: 'My API',
      rootPath: REPO,
      color: 'red',
      createdAt: '2026-10-05T12:00:00.000Z',
    }
    writeFileSync(join(dir, 'projects.json'), JSON.stringify({ version: 1, projects: [saved] }))

    const { store } = setup(dir)
    await store.load()

    expect(store.list()).toEqual([{ ...saved, name: 'bene' }])
  })

  test('removes a project', async () => {
    const project = await ctx.store.add({ rootPath: REPO })
    await ctx.store.remove(project.id)
    expect(ctx.store.list()).toEqual([])
  })

  test('writes the file atomically, leaving no temp files behind', async () => {
    await ctx.store.add({ rootPath: REPO })
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

describe('ProjectStore dev command', () => {
  test('saves a trimmed dev command and keeps it across a reload', async () => {
    // Arrange
    const { store, dir } = setup()
    await store.load()
    const project = await store.add({ rootPath: REPO })

    // Act
    const updated = await store.setDevCommand(project.id, '  npm run dev  ')
    const reloaded = setup(dir).store
    await reloaded.load()

    // Assert
    expect(updated.devCommand).toBe('npm run dev')
    expect(reloaded.list()[0]?.devCommand).toBe('npm run dev')
  })

  test('clears the dev command when given blank text or null', async () => {
    const { store } = setup()
    await store.load()
    const project = await store.add({ rootPath: REPO })
    await store.setDevCommand(project.id, 'npm run dev')

    const cleared = await store.setDevCommand(project.id, '   ')
    await store.setDevCommand(project.id, 'npm start')
    const clearedAgain = await store.setDevCommand(project.id, null)

    expect(cleared).not.toHaveProperty('devCommand')
    expect(clearedAgain).not.toHaveProperty('devCommand')
    expect(store.list()[0]).not.toHaveProperty('devCommand')
  })

  test('refuses an unknown project', async () => {
    const { store } = setup()
    await store.load()

    await expect(store.setDevCommand('nope', 'npm run dev')).rejects.toThrow('Project not found')
  })
})
