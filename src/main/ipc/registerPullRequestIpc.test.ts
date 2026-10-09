import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { GitService } from '../services/git/GitService'
import type { GitHubAuth } from '../services/github/GitHubAuth'
import type { GitHubPullFeedback } from '../services/github/GitHubPullFeedback'
import type { GitHubPulls } from '../services/github/GitHubPulls'
import { githubRepoFromRemote } from '../services/tasks/githubRepo'
import {
  FakeIpcMain,
  MANAGED_WORKTREE,
  PROJECT_ID,
  PROJECT_ROOT,
  UNMANAGED_FOLDER,
  fakeProjects,
  fakeWorktrees,
  silenceIpcLogs,
} from './fakeIpcMain'
import { registerPullRequestIpc } from './registerPullRequestIpc'

const WEB_BASE_URL = 'https://github.com'
const REMOTE = 'https://github.com/acme/demo.git'
const TOKEN = 'gho_test'
const REPO = githubRepoFromRemote(REMOTE, WEB_BASE_URL)

function setup() {
  const git = {
    status: vi.fn(async () => ({ branch: 'feature' as string | null })),
    remoteUrl: vi.fn(async (): Promise<string | null> => REMOTE),
  }
  const auth = {
    freshToken: vi.fn(async (): Promise<string | null> => TOKEN),
    withToken: vi.fn(async (run: (token: string) => unknown) => run(TOKEN)),
  }
  const pulls = { forBranch: vi.fn(async () => ({ number: 7 })) }
  const feedback = {
    reviewThreads: vi.fn(async () => [{ id: 'thread' }]),
    failingChecks: vi.fn(async () => [{ name: 'ci' }]),
  }
  const worktrees = fakeWorktrees()
  const openExternal = vi.fn(async () => {})
  const ipc = new FakeIpcMain()
  registerPullRequestIpc(
    {
      projects: fakeProjects(),
      worktrees: worktrees.manager,
      git: git as unknown as GitService,
      auth: auth as unknown as GitHubAuth,
      webBaseUrl: WEB_BASE_URL,
      pulls: pulls as unknown as GitHubPulls,
      feedback: feedback as unknown as GitHubPullFeedback,
      openExternal,
    },
    ipc,
  )
  return {
    ipc,
    git,
    auth,
    pulls,
    feedback,
    openExternal,
    resolveCheckout: worktrees.resolveCheckout,
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerPullRequestIpc', () => {
  test('registers every pull request channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [
        IpcChannel.gitPullRequestStatus,
        IpcChannel.gitPullRequestReviewThreads,
        IpcChannel.gitPullRequestFailingChecks,
        IpcChannel.gitOpenUrl,
      ].sort(),
    )
  })
})

describe('registerPullRequestIpc status', () => {
  test("returns the PR for the worktree's branch on its GitHub repo", async () => {
    // Arrange
    const { ipc, git, pulls, resolveCheckout } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitPullRequestStatus, {
      projectId: PROJECT_ID,
      worktreePath: MANAGED_WORKTREE,
    })

    // Assert
    expect(result).toEqual({ ok: true, data: { number: 7 } })
    expect(git.status).toHaveBeenCalledWith(MANAGED_WORKTREE)
    expect(git.remoteUrl).toHaveBeenCalledWith(MANAGED_WORKTREE)
    expect(pulls.forBranch).toHaveBeenCalledWith(TOKEN, REPO, 'feature')
    expect(resolveCheckout.mock.invocationCallOrder[0]).toBeLessThan(
      git.status.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test.each([
    ['signed out', (s: ReturnType<typeof setup>) => s.auth.freshToken.mockResolvedValue(null)],
    ['detached', (s: ReturnType<typeof setup>) => s.git.status.mockResolvedValue({ branch: null })],
    ['without a remote', (s: ReturnType<typeof setup>) => s.git.remoteUrl.mockResolvedValue(null)],
    [
      'on another host',
      (s: ReturnType<typeof setup>) =>
        s.git.remoteUrl.mockResolvedValue('https://gitlab.com/acme/demo.git'),
    ],
  ])('returns null when %s', async (_case, arrange) => {
    // Arrange
    const state = setup()
    arrange(state)

    // Act
    const result = await state.ipc.invoke(IpcChannel.gitPullRequestStatus, {
      projectId: PROJECT_ID,
    })

    // Assert
    expect(result).toEqual({ ok: true, data: null })
    expect(state.pulls.forBranch).not.toHaveBeenCalled()
  })

  test('refuses an unmanaged checkout before running git', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, pulls } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitPullRequestStatus, {
      projectId: PROJECT_ID,
      worktreePath: UNMANAGED_FOLDER,
    })

    // Assert
    expect(result).toEqual({ ok: false, error: 'That folder is not a worktree of this project.' })
    expect(git.status).not.toHaveBeenCalled()
    expect(git.remoteUrl).not.toHaveBeenCalled()
    expect(pulls.forBranch).not.toHaveBeenCalled()
  })
})

describe.each([
  [IpcChannel.gitPullRequestReviewThreads, 'reviewThreads', [{ id: 'thread' }]],
  [IpcChannel.gitPullRequestFailingChecks, 'failingChecks', [{ name: 'ci' }]],
] as const)('registerPullRequestIpc %s', (channel, method, expected) => {
  test(`returns feedback.${method} for the PR on the checkout's repo`, async () => {
    // Arrange
    const { ipc, git, feedback } = setup()

    // Act
    const result = await ipc.invoke(channel, { projectId: PROJECT_ID, number: 7 })

    // Assert
    expect(result).toEqual({ ok: true, data: expected })
    expect(git.remoteUrl).toHaveBeenCalledWith(PROJECT_ROOT)
    expect(feedback[method]).toHaveBeenCalledWith(TOKEN, REPO, 7)
  })

  test('fails when the checkout is not on GitHub', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, feedback } = setup()
    git.remoteUrl.mockResolvedValue('git@gitlab.com:acme/demo.git')

    // Act
    const result = await ipc.invoke(channel, { projectId: PROJECT_ID, number: 7 })

    // Assert
    expect(result).toEqual({ ok: false, error: 'This project is not on GitHub.' })
    expect(feedback[method]).not.toHaveBeenCalled()
  })

  test('refuses an unmanaged checkout before reading its remote', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, feedback } = setup()

    // Act
    const result = await ipc.invoke(channel, {
      projectId: PROJECT_ID,
      worktreePath: UNMANAGED_FOLDER,
      number: 7,
    })

    // Assert
    expect(result.ok).toBe(false)
    expect(git.remoteUrl).not.toHaveBeenCalled()
    expect(feedback[method]).not.toHaveBeenCalled()
  })

  test.each([0, -1, 1.5, '7'])('rejects the PR number %j', async (number) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git } = setup()

    // Act
    const result = await ipc.invoke(channel, { projectId: PROJECT_ID, number })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(git.remoteUrl).not.toHaveBeenCalled()
  })
})

describe('registerPullRequestIpc open URL', () => {
  test('opens a link on the GitHub host', async () => {
    // Arrange
    const { ipc, openExternal } = setup()
    const url = 'https://github.com/acme/demo/pull/7/checks'

    // Act
    const result = await ipc.invoke(IpcChannel.gitOpenUrl, { url })

    // Assert
    expect(result).toEqual({ ok: true, data: undefined })
    expect(openExternal).toHaveBeenCalledWith(url)
  })

  test.each([
    'https://evil.example/acme/demo/pull/7',
    'http://github.com/acme/demo/pull/7',
    'https://github.com.evil.example/x',
  ])('refuses %s', async (url) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitOpenUrl, { url })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Only GitHub links can be opened.' })
    expect(openExternal).not.toHaveBeenCalled()
  })

  test('rejects a payload that is not a URL', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitOpenUrl, { url: 'not a url' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(openExternal).not.toHaveBeenCalled()
  })
})
