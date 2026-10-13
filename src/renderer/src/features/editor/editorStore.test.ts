import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { FileContent } from '@shared/files'
import { fail, ok } from '@shared/result'
import { registerEditorBridge } from './editorBridge'
import { useEditorStore } from './editorStore'
import { fileKeyOf } from './fileKey'

const PROJECT = 'project-1'
const PATH = 'src/app.ts'
const KEY = fileKeyOf({ projectId: PROJECT }, PATH)
const initial = useEditorStore.getState()

const store = () => useEditorStore.getState()
const buffer = () => store().buffers[KEY]
const tabs = () => store().tabsByProject[PROJECT]?.tabs ?? []

function fileContent(content: string, mtimeMs: number): FileContent {
  return { path: PATH, content, mtimeMs, isBinary: false, isTooLarge: false }
}

interface Disk {
  content: string
  mtimeMs: number | null
}

/** A fake disk and Monaco: `disk` is what main reads, `models` what the editor holds. */
function setUp() {
  const disk: Disk = { content: 'original', mtimeMs: 100 }
  const models = new Map<string, string>()
  const bridge = {
    getContent: vi.fn((key: string) => models.get(key)),
    markSaved: vi.fn(),
    release: vi.fn(),
  }
  registerEditorBridge(bridge)
  const write = vi.fn(async (_checkout: unknown, _path: string, content: string) => {
    disk.content = content
    disk.mtimeMs = 200
    return ok({ mtimeMs: 200 })
  })
  setFakeDugout({
    files: {
      read: async () => ok(fileContent(disk.content, disk.mtimeMs ?? 0)),
      stat: async () => ok([{ path: PATH, mtimeMs: disk.mtimeMs }]),
      write,
    },
  })
  return { disk, models, bridge, write }
}

async function openFile(isPreview = false) {
  store().openFile(PROJECT, null, PATH, isPreview)
  await vi.waitFor(() => expect(buffer()).toBeDefined())
}

function tabId(): string {
  const id = tabs()[0]?.id
  if (!id) throw new Error('no tab open')
  return id
}

beforeEach(() => {
  useEditorStore.setState(initial, true)
})

describe('opening a file', () => {
  test('loads the file from disk as a clean buffer', async () => {
    // Arrange
    setUp()

    // Act
    await openFile()

    // Assert
    expect(buffer()).toMatchObject({
      diskContent: 'original',
      mtimeMs: 100,
      revision: 1,
      isDirty: false,
      diskState: 'in-sync',
      error: null,
    })
    expect(tabs()).toEqual([expect.objectContaining({ kind: 'file', path: PATH })])
  })

  test('keeps the read error on the buffer when the file cannot be read', async () => {
    // Arrange
    setUp()
    setFakeDugout({ files: { read: async () => fail('Permission denied') } })

    // Act
    await openFile()

    // Assert
    expect(buffer()).toMatchObject({ error: 'Permission denied', diskContent: '' })
  })
})

describe('closing tabs', () => {
  test('a clean tab closes at once and its buffer is released', async () => {
    // Arrange
    const { bridge } = setUp()
    await openFile()

    // Act
    store().requestClose(PROJECT, tabId())

    // Assert
    expect(tabs()).toEqual([])
    expect(buffer()).toBeUndefined()
    expect(bridge.release).toHaveBeenCalledWith([KEY])
  })

  test('a dirty tab asks first instead of closing', async () => {
    // Arrange
    setUp()
    await openFile()
    store().setDirty(KEY, true)

    // Act
    store().requestClose(PROJECT, tabId())

    // Assert
    expect(store().pendingClose[PROJECT]).toBe(tabId())
    expect(tabs()).toHaveLength(1)
  })

  test('cancel keeps the tab and its unsaved edits', async () => {
    // Arrange
    setUp()
    await openFile()
    store().setDirty(KEY, true)
    store().requestClose(PROJECT, tabId())

    // Act
    await store().resolveClose(PROJECT, 'cancel')

    // Assert
    expect(store().pendingClose[PROJECT]).toBeNull()
    expect(tabs()).toHaveLength(1)
    expect(buffer()?.isDirty).toBe(true)
  })

  test("don't save closes the tab without writing", async () => {
    // Arrange
    const { write } = setUp()
    await openFile()
    store().setDirty(KEY, true)
    store().requestClose(PROJECT, tabId())

    // Act
    await store().resolveClose(PROJECT, 'discard')

    // Assert
    expect(write).not.toHaveBeenCalled()
    expect(tabs()).toEqual([])
    expect(store().pendingClose[PROJECT]).toBeNull()
  })

  test('save writes the edits against the mtime it read, then closes', async () => {
    // Arrange
    const { models, write, bridge } = setUp()
    await openFile()
    models.set(KEY, 'edited')
    store().setDirty(KEY, true)
    store().requestClose(PROJECT, tabId())

    // Act
    await store().resolveClose(PROJECT, 'save')

    // Assert
    expect(write).toHaveBeenCalledWith({ projectId: PROJECT }, PATH, 'edited', {
      expectedMtimeMs: 100,
    })
    expect(bridge.markSaved).toHaveBeenCalledWith(KEY)
    expect(tabs()).toEqual([])
  })

  test('a save that conflicts with a change on disk keeps the tab open and asking', async () => {
    // Arrange
    const { models } = setUp()
    await openFile()
    models.set(KEY, 'edited')
    store().setDirty(KEY, true)
    store().requestClose(PROJECT, tabId())
    setFakeDugout({ files: { write: async () => fail('The file changed on disk') } })

    // Act
    await store().resolveClose(PROJECT, 'save')

    // Assert
    expect(tabs()).toHaveLength(1)
    expect(store().pendingClose[PROJECT]).toBe(tabId())
    expect(buffer()?.diskState).toBe('changed-on-disk')
    expect(store().saveErrors[KEY]).toBe('The file changed on disk')
  })
})

describe('syncWithDisk', () => {
  test('reloads a clean buffer whose file changed on disk', async () => {
    // Arrange
    const { disk } = setUp()
    await openFile()
    disk.content = 'written by an agent'
    disk.mtimeMs = 150

    // Act
    await store().syncWithDisk(PROJECT)

    // Assert
    expect(buffer()).toMatchObject({
      diskContent: 'written by an agent',
      mtimeMs: 150,
      revision: 2,
      diskState: 'in-sync',
    })
  })

  test('keeps a dirty buffer and flags the change on disk', async () => {
    // Arrange
    const { disk } = setUp()
    await openFile()
    store().setDirty(KEY, true)
    disk.content = 'written by an agent'
    disk.mtimeMs = 150

    // Act
    await store().syncWithDisk(PROJECT)

    // Assert
    expect(buffer()).toMatchObject({
      diskContent: 'original',
      revision: 1,
      isDirty: true,
      diskState: 'changed-on-disk',
    })
  })

  test('flags a deleted file', async () => {
    // Arrange
    const { disk } = setUp()
    await openFile()
    disk.mtimeMs = null

    // Act
    await store().syncWithDisk(PROJECT)

    // Assert
    expect(buffer()?.diskState).toBe('deleted')
  })

  test('an unchanged file changes nothing', async () => {
    // Arrange
    setUp()
    await openFile()
    const before = store()

    // Act
    await store().syncWithDisk(PROJECT)

    // Assert
    expect(store()).toBe(before)
  })
})

describe('unchanged input leaves state alone', () => {
  test('activating the active tab, pinning a pinned tab or repeating setDirty changes nothing', async () => {
    // Arrange
    setUp()
    await openFile()
    store().setDirty(KEY, true)
    const before = store()

    // Act
    store().activate(PROJECT, tabId())
    store().pin(PROJECT, tabId())
    store().setDirty(KEY, true)

    // Assert
    expect(store()).toBe(before)
  })

  test('editing a preview tab pins it', async () => {
    // Arrange
    setUp()
    await openFile(true)

    // Act
    store().setDirty(KEY, true)

    // Assert
    expect(tabs()[0]?.isPreview).toBe(false)
  })

  test('removeProject closes its tabs and releases their buffers', async () => {
    // Arrange
    const { bridge } = setUp()
    await openFile()

    // Act
    store().removeProject(PROJECT)

    // Assert
    expect(store().tabsByProject[PROJECT]).toBeUndefined()
    expect(store().buffers).toEqual({})
    expect(bridge.release).toHaveBeenCalledWith([KEY])
  })
})
