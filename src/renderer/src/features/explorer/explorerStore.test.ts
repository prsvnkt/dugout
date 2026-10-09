import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test } from 'vitest'
import type { DirEntry } from '@shared/files'
import { fail, ok } from '@shared/result'
import { useExplorerStore } from './explorerStore'

const CHECKOUT = { projectId: 'project-1' }
const KEY = 'project-1'
const initial = useExplorerStore.getState()

const store = () => useExplorerStore.getState()
const tree = () => store().trees[KEY]

/** A fresh listing each call, as IPC answers are. */
const listing = (path: string): readonly DirEntry[] =>
  path === ''
    ? [{ name: 'src', path: 'src', kind: 'dir', isIgnored: false }]
    : [{ name: 'app.ts', path: `${path}/app.ts`, kind: 'file', isIgnored: false }]

beforeEach(() => {
  useExplorerStore.setState(initial, true)
  setFakeDugout({ files: { readDir: async (_checkout, path) => ok(listing(path)) } })
})

describe('explorerStore', () => {
  test('expanding a folder loads it, and collapsing keeps its listing', async () => {
    // Act
    await store().toggleDir(CHECKOUT, 'src')
    await store().toggleDir(CHECKOUT, 'src')

    // Assert
    expect(tree()?.expanded).toEqual([])
    expect(tree()?.entries['src']).toEqual(listing('src'))
  })

  test('refresh re-reads the root and expanded folders, and unchanged listings keep their objects', async () => {
    // Arrange
    await store().toggleDir(CHECKOUT, 'src')
    await store().refresh(CHECKOUT)
    const before = tree()

    // Act
    await store().refresh(CHECKOUT)

    // Assert
    expect(before?.entries['']).toEqual(listing(''))
    expect(tree()).toBe(before)
  })

  test('a folder that cannot be read collapses; a root failure shows the error', async () => {
    // Arrange
    await store().toggleDir(CHECKOUT, 'src')
    setFakeDugout({ files: { readDir: async () => fail('No such folder') } })

    // Act
    await store().refresh(CHECKOUT)

    // Assert
    expect(tree()?.expanded).toEqual([])
    expect(tree()?.error).toBe('No such folder')
  })

  test('collapseAll closes every folder', async () => {
    // Arrange
    await store().toggleDir(CHECKOUT, 'src')

    // Act
    store().collapseAll(CHECKOUT)

    // Assert
    expect(tree()?.expanded).toEqual([])
  })

  test('setOpen with the current value changes nothing', () => {
    // Arrange
    const before = store()

    // Act
    store().setOpen(before.isOpen)

    // Assert
    expect(store()).toBe(before)
  })
})
