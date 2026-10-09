import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { GitService } from '../services/git/GitService'
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
import { registerGitIpc, type GitIpcDeps } from './registerGitIpc'

const GITHUB_PR_URL = 'https://github.com/acme/demo/pull/new/feature'

const GIT_METHODS = [
  'status',
  'showFile',
  'stage',
  'unstage',
  'discard',
  'commit',
  'listBranches',
  'switchBranch',
  'createBranch',
  'fetch',
  'push',
  'pullRequestUrl',
] as const
type GitMethod = (typeof GIT_METHODS)[number]

function setup(overrides: Partial<GitIpcDeps> = {}, managed = [MANAGED_WORKTREE]) {
  const calls = Object.fromEntries(
    GIT_METHODS.map((method) => [method, vi.fn(async () => ({ from: method }))]),
  ) as Record<GitMethod, ReturnType<typeof vi.fn>>
  calls.status.mockResolvedValue({ branch: 'feature', upstream: 'origin/feature', ahead: 0 })
  calls.pullRequestUrl.mockResolvedValue(GITHUB_PR_URL)
  const worktrees = fakeWorktrees(managed)
  const openExternal = vi.fn(async () => {})
  const ipc = new FakeIpcMain()
  registerGitIpc(
    {
      projects: fakeProjects(),
      git: calls as unknown as GitService,
      worktrees: worktrees.manager,
      openExternal,
      ...overrides,
    },
    ipc,
  )
  return { ipc, git: calls, resolveCheckout: worktrees.resolveCheckout, openExternal }
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** Channels that resolve the checkout, then make one git call with these arguments. */
const forwarding: {
  channel: string
  payload: Record<string, unknown>
  method: GitMethod
  args: unknown[]
}[] = [
  { channel: IpcChannel.gitStatus, payload: {}, method: 'status', args: [] },
  {
    channel: IpcChannel.gitShow,
    payload: { path: 'src/a.ts', revision: 'INDEX' },
    method: 'showFile',
    args: ['INDEX', 'src/a.ts'],
  },
  { channel: IpcChannel.gitStage, payload: { paths: ['a.ts'] }, method: 'stage', args: [['a.ts']] },
  {
    channel: IpcChannel.gitUnstage,
    payload: { paths: ['a.ts', 'b.ts'] },
    method: 'unstage',
    args: [['a.ts', 'b.ts']],
  },
  {
    channel: IpcChannel.gitDiscard,
    payload: { paths: ['a.ts'] },
    method: 'discard',
    args: [['a.ts']],
  },
  {
    // The message is trimmed and includeAll defaults to false: the parsed payload is forwarded.
    channel: IpcChannel.gitCommit,
    payload: { message: '  Fix the thing  ' },
    method: 'commit',
    args: ['Fix the thing', { includeAll: false }],
  },
  { channel: IpcChannel.gitBranches, payload: {}, method: 'listBranches', args: [] },
  {
    channel: IpcChannel.gitSwitchBranch,
    payload: { kind: 'remote', name: 'origin/feature' },
    method: 'switchBranch',
    args: [{ kind: 'remote', name: 'origin/feature' }],
  },
  {
    channel: IpcChannel.gitCreateBranch,
    payload: { name: 'feature-2', startPoint: 'main' },
    method: 'createBranch',
    args: ['feature-2', 'main'],
  },
  { channel: IpcChannel.gitFetch, payload: {}, method: 'fetch', args: [] },
  { channel: IpcChannel.gitPush, payload: {}, method: 'push', args: [] },
]

describe('registerGitIpc', () => {
  test('registers every git channel it owns', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual(
      [...forwarding.map((row) => row.channel), IpcChannel.gitOpenPullRequest].sort(),
    )
  })

  test.each(forwarding)(
    '$channel runs git.$method in the main checkout',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, git } = setup()

      // Act
      const result = await ipc.invoke(channel, { projectId: PROJECT_ID, ...payload })

      // Assert
      expect(git[method]).toHaveBeenCalledWith(PROJECT_ROOT, ...args)
      expect(result).toEqual({ ok: true, data: await git[method].mock.results[0]?.value })
    },
  )

  test.each(forwarding)(
    '$channel resolves a managed worktree before calling git',
    async ({ channel, payload, method, args }) => {
      // Arrange
      const { ipc, git, resolveCheckout } = setup()

      // Act
      await ipc.invoke(channel, {
        projectId: PROJECT_ID,
        worktreePath: MANAGED_WORKTREE,
        ...payload,
      })

      // Assert
      expect(git[method]).toHaveBeenCalledWith(MANAGED_WORKTREE, ...args)
      expect(resolveCheckout.mock.invocationCallOrder[0]).toBeLessThan(
        git[method].mock.invocationCallOrder[0] ?? 0,
      )
    },
  )

  test.each(forwarding)(
    '$channel refuses a folder that is not a managed worktree',
    async ({ channel, payload, method }) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, git } = setup()

      // Act
      const result = await ipc.invoke(channel, {
        projectId: PROJECT_ID,
        worktreePath: UNMANAGED_FOLDER,
        ...payload,
      })

      // Assert
      expect(result).toEqual({ ok: false, error: 'That folder is not a worktree of this project.' })
      expect(git[method]).not.toHaveBeenCalled()
    },
  )

  test('fails readably for an unknown project', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, resolveCheckout } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitStatus, { projectId: 'missing' })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Project not found.' })
    expect(resolveCheckout).not.toHaveBeenCalled()
    expect(git.status).not.toHaveBeenCalled()
  })

  test.each([
    [IpcChannel.gitStatus, { projectId: PROJECT_ID, worktreePath: 'relative/path' }],
    [IpcChannel.gitStatus, { projectId: '' }],
    [IpcChannel.gitShow, { projectId: PROJECT_ID, path: '/etc/passwd', revision: 'HEAD' }],
    [IpcChannel.gitShow, { projectId: PROJECT_ID, path: 'a.ts', revision: 'HEAD~1' }],
    [IpcChannel.gitStage, { projectId: PROJECT_ID, paths: ['../outside'] }],
    [IpcChannel.gitStage, { projectId: PROJECT_ID, paths: [] }],
    [IpcChannel.gitCommit, { projectId: PROJECT_ID, message: '   ' }],
    [IpcChannel.gitSwitchBranch, { projectId: PROJECT_ID, kind: 'tag', name: 'v1' }],
    [IpcChannel.gitCreateBranch, { projectId: PROJECT_ID, name: '--force' }],
    [IpcChannel.gitCreateBranch, { projectId: PROJECT_ID, name: 'has space' }],
    [IpcChannel.gitOpenPullRequest, undefined],
  ])('%s rejects the invalid payload %j before touching git', async (channel, payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, resolveCheckout } = setup()

    // Act
    const result = await ipc.invoke(channel, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(resolveCheckout).not.toHaveBeenCalled()
    for (const method of GIT_METHODS) expect(git[method]).not.toHaveBeenCalled()
  })
})

describe('registerGitIpc open pull request', () => {
  test('opens the pull request page for the resolved worktree and returns its URL', async () => {
    // Arrange
    const { ipc, git, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitOpenPullRequest, {
      projectId: PROJECT_ID,
      worktreePath: MANAGED_WORKTREE,
    })

    // Assert
    expect(result).toEqual({ ok: true, data: GITHUB_PR_URL })
    expect(git.pullRequestUrl).toHaveBeenCalledWith(MANAGED_WORKTREE, undefined)
    expect(openExternal).toHaveBeenCalledWith(GITHUB_PR_URL)
    expect(git.push).not.toHaveBeenCalled()
  })

  test.each([
    ['has no upstream', { branch: 'feature', upstream: null, ahead: 0 }],
    ['is ahead of its upstream', { branch: 'feature', upstream: 'origin/feature', ahead: 2 }],
  ])('pushes first when the branch %s', async (_case, status) => {
    // Arrange
    const { ipc, git, openExternal } = setup()
    git.status.mockResolvedValue(status)

    // Act
    await ipc.invoke(IpcChannel.gitOpenPullRequest, { projectId: PROJECT_ID })

    // Assert
    expect(git.push).toHaveBeenCalledWith(PROJECT_ROOT)
    expect(git.push.mock.invocationCallOrder[0]).toBeLessThan(
      openExternal.mock.invocationCallOrder[0] ?? 0,
    )
  })

  test('refuses to open a URL outside the known pull request hosts', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, openExternal } = setup()
    git.pullRequestUrl.mockResolvedValue('https://evil.example/acme/demo/pull/new/feature')

    // Act
    const result = await ipc.invoke(IpcChannel.gitOpenPullRequest, { projectId: PROJECT_ID })

    // Assert
    expect(result).toEqual({ ok: false, error: 'Refusing to open an unexpected URL.' })
    expect(openExternal).not.toHaveBeenCalled()
    expect(git.push).not.toHaveBeenCalled()
  })

  test('refuses an unmanaged worktree before asking git for the URL', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git, openExternal } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.gitOpenPullRequest, {
      projectId: PROJECT_ID,
      worktreePath: UNMANAGED_FOLDER,
    })

    // Assert
    expect(result.ok).toBe(false)
    expect(git.pullRequestUrl).not.toHaveBeenCalled()
    expect(openExternal).not.toHaveBeenCalled()
  })

  test('reports the task of a dugout/<number>- branch and writes its key', async () => {
    // Arrange
    const onTaskPullRequest = vi.fn()
    const taskKey = vi.fn((_projectId: string, taskNumber: number) => `ENG-${taskNumber}`)
    const { ipc, git } = setup({ onTaskPullRequest, taskKey })
    git.status.mockResolvedValue({ branch: 'dugout/12-fix-login', upstream: 'o/x', ahead: 0 })

    // Act
    await ipc.invoke(IpcChannel.gitOpenPullRequest, { projectId: PROJECT_ID })
    const keyFor = git.pullRequestUrl.mock.calls[0]?.[1] as (taskNumber: number) => string

    // Assert
    expect(onTaskPullRequest).toHaveBeenCalledWith(PROJECT_ID, 12)
    expect(keyFor(12)).toBe('ENG-12')
    expect(taskKey).toHaveBeenCalledWith(PROJECT_ID, 12)
  })

  test('does not report a task for an ordinary branch', async () => {
    // Arrange
    const onTaskPullRequest = vi.fn()
    const { ipc } = setup({ onTaskPullRequest })

    // Act
    await ipc.invoke(IpcChannel.gitOpenPullRequest, { projectId: PROJECT_ID })

    // Assert
    expect(onTaskPullRequest).not.toHaveBeenCalled()
  })
})
