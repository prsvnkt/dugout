import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { LinearAuth } from '../services/linear/LinearAuth'
import type { LinearIssues } from '../services/linear/LinearIssues'
import { FakeIpcMain, silenceIpcLogs } from './fakeIpcMain'
import { registerLinearIpc } from './registerLinearIpc'

const API_KEY = 'lin_api_test'

function setup() {
  const auth = {
    state: vi.fn(() => ({ status: 'connected', name: 'Ada' })),
    connect: vi.fn(async () => ({ status: 'connected', name: 'Ada' })),
    disconnect: vi.fn(async () => ({ status: 'disconnected' })),
    withKey: vi.fn(async (run: (apiKey: string) => unknown) => run(API_KEY)),
  }
  const issues = { teams: vi.fn(async () => [{ key: 'ENG', name: 'Engineering' }]) }
  const ipc = new FakeIpcMain()
  registerLinearIpc(
    { auth: auth as unknown as LinearAuth, issues: issues as unknown as LinearIssues },
    ipc,
  )
  return { ipc, auth, issues }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerLinearIpc', () => {
  test('registers every Linear channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        IpcChannel.linearGetState,
        IpcChannel.linearConnect,
        IpcChannel.linearDisconnect,
        IpcChannel.linearListTeams,
      ].sort(),
    )
  })

  test('returns the connection state', async () => {
    // Arrange
    const { ipc } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.linearGetState)

    // Assert
    expect(result).toEqual({ ok: true, data: { status: 'connected', name: 'Ada' } })
  })

  test('connects with the trimmed API key', async () => {
    // Arrange
    const { ipc, auth } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.linearConnect, { apiKey: `  ${API_KEY}  ` })

    // Assert
    expect(auth.connect).toHaveBeenCalledWith(API_KEY)
    expect(result).toEqual({ ok: true, data: { status: 'connected', name: 'Ada' } })
  })

  test('disconnects', async () => {
    // Arrange
    const { ipc, auth } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.linearDisconnect)

    // Assert
    expect(auth.disconnect).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, data: { status: 'disconnected' } })
  })

  test('lists teams with the key, which never reaches the renderer', async () => {
    // Arrange
    const { ipc, issues } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.linearListTeams)

    // Assert
    expect(issues.teams).toHaveBeenCalledWith(API_KEY)
    expect(result).toEqual({ ok: true, data: [{ key: 'ENG', name: 'Engineering' }] })
    expect(JSON.stringify(result)).not.toContain(API_KEY)
  })

  test.each([
    [IpcChannel.linearConnect, { apiKey: '   ' }],
    [IpcChannel.linearConnect, { apiKey: 'x'.repeat(10_000) }],
    [IpcChannel.linearConnect, undefined],
    [IpcChannel.linearDisconnect, { now: true }],
  ])('%s rejects the invalid payload', async (channel, payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, auth } = setup()

    // Act
    const result = await ipc.invoke(channel, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(auth.connect).not.toHaveBeenCalled()
    expect(auth.disconnect).not.toHaveBeenCalled()
  })
})
