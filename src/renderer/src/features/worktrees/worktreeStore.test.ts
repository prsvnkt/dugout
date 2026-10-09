import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { fail, ok } from '@shared/result'
import type { Worktree } from '@shared/worktree'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { useWorktreeStore } from './worktreeStore'

const PROJECT = 'project-1'
const initial = useWorktreeStore.getState()
const initialWorkspace = useWorkspaceStore.getState()

const store = () => useWorktreeStore.getState()

/** A fresh object each call, as IPC answers are. */
const worktree = (): Worktree => ({ path: '/repo/.w/a', branch: 'dugout/a', name: 'a' })

beforeEach(() => {
  useWorktreeStore.setState(initial, true)
  useWorkspaceStore.setState(initialWorkspace, true)
})

describe('load', () => {
  test('stores the project worktrees', async () => {
    // Arrange
    setFakeDugout({ worktrees: { list: async () => ok([worktree()]) } })

    // Act
    await store().load(PROJECT)

    // Assert
    expect(store().byProject[PROJECT]).toEqual([worktree()])
  })

  test('an unchanged list leaves state alone', async () => {
    // Arrange
    setFakeDugout({ worktrees: { list: async () => ok([worktree()]) } })
    await store().load(PROJECT)
    const before = store()

    // Act
    await store().load(PROJECT)

    // Assert
    expect(store()).toBe(before)
  })

  test('the same error again leaves state alone', async () => {
    // Arrange
    setFakeDugout({ worktrees: { list: async () => fail('git failed') } })
    await store().load(PROJECT)
    const before = store()

    // Act
    await store().load(PROJECT)

    // Assert
    expect(before.errors[PROJECT]).toBe('git failed')
    expect(store()).toBe(before)
  })
})

describe('startSession and remove', () => {
  test('startSession opens an agent in the new worktree and reloads the list', async () => {
    // Arrange
    const list = vi.fn(async () => ok([worktree()]))
    setFakeDugout({ worktrees: { create: async () => ok(worktree()), list } })

    // Act
    await store().startSession(PROJECT, 'claude')

    // Assert
    expect(useWorkspaceStore.getState().layouts[PROJECT]?.panes).toEqual([
      expect.objectContaining({ kind: 'claude', worktree: worktree() }),
    ])
    expect(list).toHaveBeenCalledTimes(1)
  })

  test('a failed remove keeps the panes and shows the error until dismissed', async () => {
    // Arrange
    setFakeDugout({ worktrees: { remove: async () => fail('Uncommitted changes') } })
    useWorkspaceStore.getState().addPane(PROJECT, 'claude', worktree())

    // Act
    await store().remove(PROJECT, worktree().path)

    // Assert
    expect(store().errors[PROJECT]).toBe('Uncommitted changes')
    expect(useWorkspaceStore.getState().layouts[PROJECT]?.panes).toHaveLength(1)
    store().dismissError(PROJECT)
    expect(store().errors[PROJECT]).toBeNull()
  })

  test('remove closes the worktree panes and shows the main checkout', async () => {
    // Arrange
    setFakeDugout({
      worktrees: { remove: async () => ok(undefined), list: async () => ok([]) },
    })
    useWorkspaceStore.getState().addPane(PROJECT, 'claude', worktree())

    // Act
    await store().remove(PROJECT, worktree().path)

    // Assert
    expect(useWorkspaceStore.getState().layouts[PROJECT]?.panes).toEqual([])
    expect(useWorkspaceStore.getState().gitCheckouts[PROJECT]).toBeNull()
    expect(store().byProject[PROJECT]).toEqual([])
  })
})
