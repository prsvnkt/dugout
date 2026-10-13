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
import { registerCompareIpc } from './registerCompareIpc'

const OTHER_WORKTREE = '/worktrees/p1/other'

function setup(baseBranch: string | null = 'develop') {
  const git = {
    status: vi.fn(async () => ({ baseBranch })),
    changesSince: vi.fn(async (root: string) => [{ path: `${root}/a.ts` }]),
  }
  const worktrees = fakeWorktrees([MANAGED_WORKTREE, OTHER_WORKTREE])
  const ipc = new FakeIpcMain()
  registerCompareIpc(fakeProjects(), worktrees.manager, git as unknown as GitService, ipc)
  return { ipc, git }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerCompareIpc', () => {
  test('registers the compare channel', () => {
    // Arrange / Act
    const { ipc } = setup()

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.compareChanges])
  })

  test("returns each worktree's changes since the project's base branch", async () => {
    // Arrange
    const { ipc, git } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.compareChanges, {
      projectId: PROJECT_ID,
      worktreePaths: [MANAGED_WORKTREE, OTHER_WORKTREE],
    })

    // Assert
    expect(git.status).toHaveBeenCalledWith(PROJECT_ROOT)
    expect(git.changesSince.mock.calls).toEqual([
      [MANAGED_WORKTREE, 'develop'],
      [OTHER_WORKTREE, 'develop'],
    ])
    expect(result).toEqual({
      ok: true,
      data: [
        { worktreePath: MANAGED_WORKTREE, changes: [{ path: `${MANAGED_WORKTREE}/a.ts` }] },
        { worktreePath: OTHER_WORKTREE, changes: [{ path: `${OTHER_WORKTREE}/a.ts` }] },
      ],
    })
  })

  test('compares against main when the base branch is unknown', async () => {
    // Arrange
    const { ipc, git } = setup(null)

    // Act
    await ipc.invoke(IpcChannel.compareChanges, {
      projectId: PROJECT_ID,
      worktreePaths: [MANAGED_WORKTREE, OTHER_WORKTREE],
    })

    // Assert
    expect(git.changesSince).toHaveBeenCalledWith(MANAGED_WORKTREE, 'main')
  })

  test('refuses an unmanaged folder', async () => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.compareChanges, {
      projectId: PROJECT_ID,
      worktreePaths: [MANAGED_WORKTREE, UNMANAGED_FOLDER],
    })

    // Assert
    expect(result).toEqual({ ok: false, error: 'That folder is not a worktree of this project.' })
    expect(git.changesSince).not.toHaveBeenCalledWith(UNMANAGED_FOLDER, expect.anything())
  })

  test.each([
    { projectId: PROJECT_ID, worktreePaths: [MANAGED_WORKTREE] },
    { projectId: PROJECT_ID, worktreePaths: [MANAGED_WORKTREE, 'relative'] },
  ])('rejects the invalid request %j', async (payload) => {
    // Arrange
    silenceIpcLogs()
    const { ipc, git } = setup()

    // Act
    const result = await ipc.invoke(IpcChannel.compareChanges, payload)

    // Assert
    expect(result).toEqual({ ok: false, error: 'Invalid request.' })
    expect(git.status).not.toHaveBeenCalled()
  })
})
