import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { GitService } from '../services/git/GitService'
import type { GitHubAuth } from '../services/github/GitHubAuth'
import type { GitHubDeployments } from '../services/github/GitHubDeployments'
import { githubRepoFromRemote } from '../services/tasks/githubRepo'
import {
  FakeIpcMain,
  MANAGED_WORKTREE,
  PROJECT_ID,
  UNMANAGED_FOLDER,
  fakeProjects,
  fakeWorktrees,
  silenceIpcLogs,
} from './fakeIpcMain'
import { registerPreviewIpc } from './registerPreviewIpc'

const WEB_BASE_URL = 'https://github.com'
const REMOTE = 'git@github.com:acme/demo.git'
const TOKEN = 'gho_test'
const PREVIEW_URL = 'https://demo-git-feature.vercel.app/'

function setup() {
  const git = {
    status: vi.fn(async () => ({ branch: 'feature' as string | null })),
    remoteUrl: vi.fn(async (): Promise<string | null> => REMOTE),
  }
  const auth = {
    freshToken: vi.fn(async (): Promise<string | null> => TOKEN),
    withToken: vi.fn(async (run: (token: string) => unknown) => run(TOKEN)),
  }
  const deployments = {
    forBranch: vi.fn(async (): Promise<{ url: string | null } | null> => ({ url: PREVIEW_URL })),
  }
  const isPortFree = vi.fn(async (port: number) => port !== 4101)
  const openExternal = vi.fn(async () => {})
  const worktrees = fakeWorktrees()
  const ipc = new FakeIpcMain()
  registerPreviewIpc(
    {
      projects: fakeProjects(),
      worktrees: worktrees.manager,
      git: git as unknown as GitService,
      auth: auth as unknown as GitHubAuth,
      webBaseUrl: WEB_BASE_URL,
      deployments: deployments as unknown as GitHubDeployments,
      isPortFree,
      openExternal,
    },
    ipc,
  )
  return { ipc, git, auth, deployments, isPortFree, openExternal }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerPreviewIpc', () => {
  test('registers the preview channels', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        IpcChannel.previewDeployment,
        IpcChannel.previewAssignPort,
        IpcChannel.previewOpenUrl,
      ].sort(),
    )
  })
})

describe('registerPreviewIpc deployment', () => {
  test("returns the preview deployment of the worktree's branch", async () => {
    // Arrange
    const { ipc, git, deployments } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.previewDeployment, {
      projectId: PROJECT_ID,
      worktreePath: MANAGED_WORKTREE,
    })

    // Assert
    expect(result).toEqual({ ok: true, data: { url: PREVIEW_URL } })
    expect(git.status).toHaveBeenCalledWith(MANAGED_WORKTREE)
    expect(deployments.forBranch).toHaveBeenCalledWith(
      TOKEN,
      githubRepoFromRemote(REMOTE, WEB_BASE_URL),
      'feature',
    )
  })

  test('returns null without asking GitHub when signed out', async () => {
    // Arrange
    const { ipc, auth, deployments } = setup()
    auth.freshToken.mockResolvedValue(null)

    // Act
    const result = await ipc.invoke(IpcChannel.previewDeployment, { projectId: PROJECT_ID })

    // Assert
    expect(result).toEqual({ ok: true, data: null })
    expect(deployments.forBranch).not.toHaveBeenCalled()
  })

  test('refuses an unmanaged checkout before running git', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.previewDeployment, {
      projectId: PROJECT_ID,
      worktreePath: UNMANAGED_FOLDER,
    })

    // Assert
    expect(result).toEqual({ ok: false, error: 'That folder is not a worktree of this project.' })
    expect(git.status).not.toHaveBeenCalled()
  })
})

describe('registerPreviewIpc open URL', () => {
  test('opens a preview URL main reported earlier', async () => {
    // Arrange
    const { ipc, openExternal } = setup()
    await ipc.invoke(IpcChannel.previewDeployment, { projectId: PROJECT_ID })

    // Act
    const result = await ipc.invoke(IpcChannel.previewOpenUrl, { url: PREVIEW_URL })

    // Assert
    expect(result).toEqual({ ok: true, data: undefined })
    expect(openExternal).toHaveBeenCalledWith(PREVIEW_URL)
  })

  test('opens a local dev server root', async () => {
    // Arrange
    const { ipc, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.previewOpenUrl, { url: 'http://localhost:4100/' })

    // Assert
    expect(result.ok).toBe(true)
    expect(openExternal).toHaveBeenCalledWith('http://localhost:4100/')
  })

  test.each([
    PREVIEW_URL, // not reported by main in this test
    'https://evil.example/',
    'http://localhost:4100/admin?token=1',
    'http://localhost:80/',
    'file:///etc/passwd',
  ])('refuses %s', async (url) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.previewOpenUrl, { url })

    // Assert
    expect(result).toEqual({
      ok: false,
      error: 'Only preview and dev server links can be opened.',
    })
    expect(openExternal).not.toHaveBeenCalled()
  })

  test('rejects a payload that is not a URL', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.previewOpenUrl, { url: 'localhost' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('registerPreviewIpc assign port', () => {
  test('returns the first free port that is not reserved', async () => {
    // Arrange
    const { ipc, isPortFree } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.previewAssignPort, { reserved: [4100] })

    // Assert
    expect(result).toEqual({ ok: true, data: 4102 })
    expect(isPortFree).not.toHaveBeenCalledWith(4100)
  })

  test.each([{ reserved: [80] }, { reserved: 'all' }, {}])(
    'rejects the invalid request %j',
    async (payload) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, isPortFree } = setup()

      // Act
      const result = await ipc.invoke(IpcChannel.previewAssignPort, payload)

      // Assert
      expect(result).toEqual({ ok: false, error: 'Invalid request.' })
      expect(isPortFree).not.toHaveBeenCalled()
    },
  )
})
