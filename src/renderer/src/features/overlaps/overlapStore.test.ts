import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { WorktreeChanges } from '@shared/compare'
import { fail, ok } from '@shared/result'
import { useOverlapStore } from './overlapStore'

const PROJECT = 'project-1'
const PATHS = ['/w/a', '/w/b']
const initial = useOverlapStore.getState()

const store = () => useOverlapStore.getState()

/** A fresh array each call, as IPC answers are. */
const changes = (): readonly WorktreeChanges[] => [
  { worktreePath: '/w/a', changes: [{ path: 'a.ts', kind: 'modified' }] },
  { worktreePath: '/w/b', changes: [{ path: 'a.ts', kind: 'modified' }] },
]

beforeEach(() => {
  useOverlapStore.setState(initial, true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('overlapStore refresh', () => {
  test('stores what each worktree changed', async () => {
    // Arrange
    setFakeDugout({ compare: { changes: async () => ok(changes()) } })

    // Act
    await store().refresh(PROJECT, PATHS)

    // Assert
    expect(store().byProject[PROJECT]).toEqual(changes())
  })

  test('unchanged changes leave state alone', async () => {
    // Arrange
    setFakeDugout({ compare: { changes: async () => ok(changes()) } })
    await store().refresh(PROJECT, PATHS)
    const before = store()

    // Act
    await store().refresh(PROJECT, PATHS)

    // Assert
    expect(store()).toBe(before)
  })

  test('fewer than two worktrees cannot overlap and are not asked about', async () => {
    // Arrange
    const compare = vi.fn(async () => ok(changes()))
    setFakeDugout({ compare: { changes: compare } })

    // Act
    await store().refresh(PROJECT, ['/w/a'])

    // Assert
    expect(compare).not.toHaveBeenCalled()
    expect(store().byProject[PROJECT]).toBeUndefined()
  })

  test('a failed check clears the warnings', async () => {
    // Arrange
    setFakeDugout({ compare: { changes: async () => ok(changes()) } })
    await store().refresh(PROJECT, PATHS)
    setFakeDugout({ compare: { changes: async () => fail('worktree gone') } })

    // Act
    await store().refresh(PROJECT, PATHS)

    // Assert
    expect(store().byProject[PROJECT]).toEqual([])
  })
})
