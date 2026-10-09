import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { GitStatus } from '@shared/git'
import { fail, ok } from '@shared/result'
import { checkoutKey, useGitStore } from './gitStore'

const CHECKOUT = { projectId: 'project-1' }
const KEY = checkoutKey(CHECKOUT)
const initial = useGitStore.getState()

const store = () => useGitStore.getState()

/** A fresh object each call, as IPC answers are. */
const status = (ahead = 0): GitStatus => ({
  branch: 'main',
  upstream: 'origin/main',
  ahead,
  behind: 0,
  isUnborn: false,
  baseBranch: 'main',
  files: [],
})

beforeEach(() => {
  useGitStore.setState(initial, true)
})

describe('checkoutKey', () => {
  test('keys the main checkout by project and a worktree by project and path', () => {
    expect(checkoutKey({ projectId: 'p' })).toBe('p')
    expect(checkoutKey({ projectId: 'p', worktreePath: '/w' })).toBe('p::/w')
  })
})

describe('refresh', () => {
  test('stores the status and clears an earlier error', async () => {
    // Arrange
    setFakeDugout({ git: { status: async () => fail('not a repo') } })
    await store().refresh(CHECKOUT)
    setFakeDugout({ git: { status: async () => ok(status()) } })

    // Act
    await store().refresh(CHECKOUT)

    // Assert
    expect(store().byCheckout[KEY]).toMatchObject({ status: status(), statusError: null })
  })

  test('an unchanged status leaves state alone', async () => {
    // Arrange
    setFakeDugout({ git: { status: async () => ok(status()) } })
    await store().refresh(CHECKOUT)
    const before = store()

    // Act
    await store().refresh(CHECKOUT)

    // Assert
    expect(store()).toBe(before)
  })

  test('the same error again leaves state alone', async () => {
    // Arrange
    setFakeDugout({ git: { status: async () => fail('not a repo') } })
    await store().refresh(CHECKOUT)
    const before = store()

    // Act
    await store().refresh(CHECKOUT)

    // Assert
    expect(store()).toBe(before)
  })
})

describe('actions', () => {
  test('a failed action shows its error and is no longer busy', async () => {
    // Arrange
    setFakeDugout({
      git: { status: async () => ok(status()), push: async () => fail('rejected') },
    })

    // Act
    await store().push(CHECKOUT)

    // Assert
    expect(store().byCheckout[KEY]).toMatchObject({ isBusy: false, actionError: 'rejected' })
  })

  test('commit and push pushes only after a successful commit', async () => {
    // Arrange
    const push = vi.fn(async () => ok(undefined))
    setFakeDugout({
      git: { status: async () => ok(status(1)), commit: async () => ok(undefined), push },
    })

    // Act
    const isCommitted = await store().commit(CHECKOUT, 'Fix', { andPush: true })

    // Assert
    expect(isCommitted).toBe(true)
    expect(push).toHaveBeenCalledWith(CHECKOUT)
  })
})

describe('panel', () => {
  test('setPanelOpen with the current value changes nothing', () => {
    // Arrange
    const before = store()

    // Act
    store().setPanelOpen(before.isPanelOpen)

    // Assert
    expect(store()).toBe(before)
  })
})
