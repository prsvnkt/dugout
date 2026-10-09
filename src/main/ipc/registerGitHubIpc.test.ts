import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { GitHubApi } from '../services/github/GitHubApi'
import type { GitHubAuth } from '../services/github/GitHubAuth'
import { FakeIpcMain, silenceIpcLogs } from './fakeIpcMain'
import { registerGitHubIpc } from './registerGitHubIpc'

const WEB_BASE_URL = 'https://github.com'
const TOKEN = 'gho_test'

function pending(verificationUri: string) {
  return { status: 'pending', prompt: { verificationUri, userCode: 'ABCD-1234' } }
}

function setup(state: unknown = { status: 'signed-out' }) {
  const auth = {
    state: vi.fn(() => state),
    startSignIn: vi.fn(async () => ({ from: 'startSignIn' })),
    cancelSignIn: vi.fn(async () => ({ from: 'cancelSignIn' })),
    signOut: vi.fn(async () => ({ from: 'signOut' })),
    retryNow: vi.fn(async () => ({ from: 'retryNow' })),
    withToken: vi.fn(async (run: (token: string) => unknown) => run(TOKEN)),
  }
  const api = { listRepos: vi.fn(async () => [{ fullName: 'acme/demo' }]) }
  const openExternal = vi.fn(async () => {})
  const ipc = new FakeIpcMain()
  registerGitHubIpc(
    {
      auth: auth as unknown as GitHubAuth,
      api: api as unknown as GitHubApi,
      webBaseUrl: WEB_BASE_URL,
      openExternal,
    },
    ipc,
  )
  return { ipc, auth, api, openExternal }
}

afterEach(() => {
  vi.restoreAllMocks()
})

const forwarding = [
  [IpcChannel.authStart, 'startSignIn'],
  [IpcChannel.authCancel, 'cancelSignIn'],
  [IpcChannel.authSignOut, 'signOut'],
  [IpcChannel.authRetry, 'retryNow'],
] as const

describe('registerGitHubIpc', () => {
  test('registers every sign-in and repository channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        IpcChannel.authGetState,
        ...forwarding.map(([channel]) => channel),
        IpcChannel.authOpenVerification,
        IpcChannel.githubListRepos,
      ].sort(),
    )
  })

  test('returns the sign-in state', async () => {
    // Arrange
    const { ipc } = setup({ status: 'signed-in', login: 'ada' })

    // Act
    const result = await ipc.invoke(IpcChannel.authGetState)

    // Assert
    expect(result).toEqual({ ok: true, data: { status: 'signed-in', login: 'ada' } })
  })

  test.each(forwarding)('%s calls auth.%s', async (channel, method) => {
    // Arrange
    const { ipc, auth } = setup()

    // Act
    const result = await ipc.invoke(channel)

    // Assert
    expect(result).toEqual({ ok: true, data: { from: method } })
    expect(auth[method]).toHaveBeenCalledTimes(1)
  })

  test.each([IpcChannel.authStart, IpcChannel.githubListRepos])(
    '%s rejects a payload',
    async (channel) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, auth, api } = setup()

      // Act
      const result = await ipc.invoke(channel, { token: 'stolen' })

      // Assert
      expect(result).toEqual({ ok: false, error: 'Invalid request.' })
      expect(auth.startSignIn).not.toHaveBeenCalled()
      expect(api.listRepos).not.toHaveBeenCalled()
    },
  )

  test('lists repositories with the token, which never reaches the renderer', async () => {
    // Arrange
    const { ipc, api } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.githubListRepos)

    // Assert
    expect(api.listRepos).toHaveBeenCalledWith(TOKEN)
    expect(result).toEqual({ ok: true, data: [{ fullName: 'acme/demo' }] })
    expect(JSON.stringify(result)).not.toContain(TOKEN)
  })
})

describe('registerGitHubIpc open verification page', () => {
  test('opens the verification page GitHub returned', async () => {
    // Arrange
    const { ipc, openExternal } = setup(pending('https://github.com/login/device'))

    // Act
    const result = await ipc.invoke(IpcChannel.authOpenVerification)

    // Assert
    expect(result).toEqual({ ok: true, data: undefined })
    expect(openExternal).toHaveBeenCalledWith('https://github.com/login/device')
  })

  test('refuses a verification page on another host', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openExternal } = setup(pending('https://evil.example/login/device'))

    // Act
    const result = await ipc.invoke(IpcChannel.authOpenVerification)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Unexpected sign-in page.' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  test('fails when no sign-in is in progress', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openExternal } = setup({ status: 'signed-out' })

    // Act
    const result = await ipc.invoke(IpcChannel.authOpenVerification)

    // Assert
    expect(result).toEqual({ ok: false, error: 'No sign-in in progress.' })
    expect(openExternal).not.toHaveBeenCalled()
  })
})
