import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test, vi, type Mock } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { GitService } from '../services/git/GitService'
import type { Settings, SettingsStore } from '../services/settings/SettingsStore'
import { FakeIpcMain, fakeSender, silenceIpcLogs } from './fakeIpcMain'
import { registerCloneIpc } from './registerCloneIpc'

const REPO_URL = 'https://github.com/acme/demo.git'

interface CloneOptions {
  readonly signal: AbortSignal
  readonly onProgress: (progress: unknown) => void
}
type CloneFn = (url: string, destination: string, options: CloneOptions) => Promise<void>

function makeDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** A clone that runs until the test finishes it, like a real one in flight. */
function pendingClone() {
  let finish = () => {}
  const done = new Promise<void>((resolve) => {
    finish = resolve
  })
  const clone = vi.fn<CloneFn>(() => done)
  return { clone, finish }
}

function setup(
  saved: Partial<Settings> = {},
  clone: Mock<CloneFn> = vi.fn<CloneFn>(async () => {}),
) {
  const homeDir = makeDir('dugout-clone-home-')
  const settings = {
    load: vi.fn(async (): Promise<Partial<Settings>> => saved),
    update: vi.fn(async (change: Partial<Settings>) => ({ ...saved, ...change })),
  }
  const ipc = new FakeIpcMain()
  registerCloneIpc(
    { clone } as unknown as GitService,
    settings as unknown as SettingsStore,
    homeDir,
    ipc,
  )
  return { ipc, settings, homeDir, clone }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerCloneIpc', () => {
  test('registers the clone channels', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [IpcChannel.cloneDefaults, IpcChannel.cloneStart, IpcChannel.cloneCancel].sort(),
    )
  })
})

describe('registerCloneIpc defaults', () => {
  test('offers the folder the last clone went to', async () => {
    // Arrange
    const { ipc } = setup({ cloneParentDir: '/Users/me/code' })

    // Act
    const result = await ipc.invoke(IpcChannel.cloneDefaults)

    // Assert
    expect(result).toEqual({ ok: true, data: { parentDir: '/Users/me/code' } })
  })

  test('offers Developer in the injected home folder when it exists', async () => {
    // Arrange
    const { ipc, homeDir } = setup()
    mkdirSync(join(homeDir, 'Developer'))

    // Act
    const result = await ipc.invoke(IpcChannel.cloneDefaults)

    // Assert
    expect(result).toEqual({ ok: true, data: { parentDir: join(homeDir, 'Developer') } })
  })

  test('offers the injected home folder itself otherwise, never the real one', async () => {
    // Arrange
    const { ipc, homeDir } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.cloneDefaults)

    // Assert
    expect(result).toEqual({ ok: true, data: { parentDir: homeDir } })
  })

  test('rejects a payload', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, settings } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.cloneDefaults, { parentDir: '/' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(settings.load).not.toHaveBeenCalled()
  })
})

describe('registerCloneIpc start', () => {
  test('clones into parent/folder, remembers the parent and returns the destination', async () => {
    // Arrange
    const { ipc, clone, settings } = setup()
    const parentDir = makeDir('dugout-clone-parent-')

    // Act
    const result = await ipc.invoke(IpcChannel.cloneStart, {
      url: REPO_URL,
      parentDir,
      folderName: 'demo',
    })

    // Assert
    expect(result).toEqual({ ok: true, data: join(parentDir, 'demo') })
    expect(clone).toHaveBeenCalledWith(REPO_URL, join(parentDir, 'demo'), {
      signal: expect.any(AbortSignal),
      onProgress: expect.any(Function),
    })
    expect(settings.update).toHaveBeenCalledWith({ cloneParentDir: parentDir })
  })

  test('fails when the parent folder does not exist', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, clone } = setup()
    const parentDir = join(makeDir('dugout-clone-parent-'), 'missing')

    // Act
    const result = await ipc.invoke(IpcChannel.cloneStart, {
      url: REPO_URL,
      parentDir,
      folderName: 'demo',
    })

    // Assert
    expect(result).toEqual({ ok: false, error: `Folder does not exist: ${parentDir}` })
    expect(clone).not.toHaveBeenCalled()
  })

  test.each([
    { url: '--upload-pack=touch /tmp/x', parentDir: '/tmp', folderName: 'demo' },
    { url: REPO_URL, parentDir: 'relative', folderName: 'demo' },
    { url: REPO_URL, parentDir: '/tmp', folderName: '..' },
    { url: REPO_URL, parentDir: '/tmp', folderName: 'a/b' },
  ])('rejects the invalid request %j before cloning', async (payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, clone } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.cloneStart, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(clone).not.toHaveBeenCalled()
  })

  test('forwards progress to the window that asked, while it is alive', async () => {
    // Arrange
    const { clone, finish } = pendingClone()
    const { ipc } = setup({}, clone)
    const sender = fakeSender(1)
    const parentDir = makeDir('dugout-clone-parent-')
    const started = ipc.invoke(
      IpcChannel.cloneStart,
      { url: REPO_URL, parentDir, folderName: 'demo' },
      sender,
    )
    await vi.waitFor(() => expect(clone).toHaveBeenCalled())
    const { onProgress } = clone.mock.lastCall?.[2] as CloneOptions

    // Act
    onProgress({ phase: 'Receiving objects', percent: 40 })
    sender.destroyed = true
    onProgress({ phase: 'Receiving objects', percent: 80 })
    finish()
    await started

    // Assert
    expect(sender.sent).toEqual([
      { channel: IpcChannel.cloneProgress, payload: { phase: 'Receiving objects', percent: 40 } },
    ])
  })

  test('allows one clone at a time per window', async () => {
    // Arrange
    silenceIpcLogs()
    const { clone, finish } = pendingClone()
    const { ipc } = setup({}, clone)
    const parentDir = makeDir('dugout-clone-parent-')
    const request = { url: REPO_URL, parentDir, folderName: 'demo' }
    const first = ipc.invoke(IpcChannel.cloneStart, request, fakeSender(1))
    await vi.waitFor(() => expect(clone).toHaveBeenCalledTimes(1))

    // Act
    const second = await ipc.invoke(IpcChannel.cloneStart, request, fakeSender(1))
    const otherWindow = ipc.invoke(IpcChannel.cloneStart, request, fakeSender(2))
    await vi.waitFor(() => expect(clone).toHaveBeenCalledTimes(2))
    finish()

    // Assert
    expect(second).toEqual({ ok: false, error: 'A clone is already in progress.' })
    expect((await first).ok).toBe(true)
    expect((await otherWindow).ok).toBe(true)
  })
})

describe('registerCloneIpc cancel', () => {
  test("aborts the asking window's clone in flight", async () => {
    // Arrange
    const { clone, finish } = pendingClone()
    const { ipc } = setup({}, clone)
    const sender = fakeSender(1)
    const parentDir = makeDir('dugout-clone-parent-')
    const started = ipc.invoke(
      IpcChannel.cloneStart,
      { url: REPO_URL, parentDir, folderName: 'demo' },
      sender,
    )
    await vi.waitFor(() => expect(clone).toHaveBeenCalled())
    const { signal } = clone.mock.lastCall?.[2] as CloneOptions

    // Act
    ipc.emit(IpcChannel.cloneCancel, sender)

    // Assert
    expect(signal.aborted).toBe(true)
    finish()
    await started
  })

  test("leaves another window's clone running", async () => {
    // Arrange
    const { clone, finish } = pendingClone()
    const { ipc } = setup({}, clone)
    const parentDir = makeDir('dugout-clone-parent-')
    const started = ipc.invoke(
      IpcChannel.cloneStart,
      { url: REPO_URL, parentDir, folderName: 'demo' },
      fakeSender(1),
    )
    await vi.waitFor(() => expect(clone).toHaveBeenCalled())
    const { signal } = clone.mock.lastCall?.[2] as CloneOptions

    // Act
    ipc.emit(IpcChannel.cloneCancel, fakeSender(2))

    // Assert
    expect(signal.aborted).toBe(false)
    finish()
    await started
  })

  test('frees the window for a new clone once the clone fails', async () => {
    // Arrange
    silenceIpcLogs()
    const clone = vi.fn<CloneFn>(async () => {
      throw new Error('Clone cancelled.')
    })
    const { ipc, settings } = setup({}, clone)
    const parentDir = makeDir('dugout-clone-parent-')
    const request = { url: REPO_URL, parentDir, folderName: 'demo' }
    await ipc.invoke(IpcChannel.cloneStart, request)

    // Act
    const retry = await ipc.invoke(IpcChannel.cloneStart, request)

    // Assert
    expect(retry).toEqual({ ok: false, error: 'Clone cancelled.' })
    expect(clone).toHaveBeenCalledTimes(2)
    expect(settings.update).not.toHaveBeenCalled()
  })

  test('does nothing when no clone is running', () => {
    // Arrange
    const { ipc } = setup()

    // Act
    const cancel = () => ipc.emit(IpcChannel.cloneCancel, fakeSender(1))

    // Assert
    expect(cancel).not.toThrow()
  })
})
