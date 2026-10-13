import { setFakeDugout } from '@renderer/lib/fakeDugout.testSupport'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { fail, ok } from '@shared/result'
import { EMPTY_TOTALS, type ProjectUsage } from '@shared/usage'
import { useUsageStore, watchUsageChanges } from './usageStore'

const PROJECT = 'project-1'
const initial = useUsageStore.getState()

const store = () => useUsageStore.getState()

/** A fresh object each call, as IPC answers are. */
const usage = (costUsd = 0): ProjectUsage => ({
  lifetime: { ...EMPTY_TOTALS, costUsd },
  last30Days: { ...EMPTY_TOTALS },
  byAgent: {},
  byModel: [],
  byTask: [],
  days: [],
  pricesAsOf: '2026-01-01',
})

beforeEach(() => {
  useUsageStore.setState(initial, true)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('load', () => {
  test('stores the usage and clears an earlier error', async () => {
    // Arrange
    setFakeDugout({ usage: { project: async () => fail('ledger unreadable') } })
    await store().load(PROJECT)
    setFakeDugout({ usage: { project: async () => ok(usage(2)) } })

    // Act
    await store().load(PROJECT)

    // Assert
    expect(store().projects[PROJECT]).toEqual(usage(2))
    expect(store().errors).toEqual({})
  })

  test('unchanged usage leaves state alone', async () => {
    // Arrange
    setFakeDugout({ usage: { project: async () => ok(usage(2)) } })
    await store().load(PROJECT)
    const before = store()

    // Act
    await store().load(PROJECT)

    // Assert
    expect(store()).toBe(before)
  })

  test('the same error again leaves state alone', async () => {
    // Arrange
    setFakeDugout({ usage: { project: async () => fail('ledger unreadable') } })
    await store().load(PROJECT)
    const before = store()

    // Act
    await store().load(PROJECT)

    // Assert
    expect(store()).toBe(before)
  })
})

describe('watchUsageChanges', () => {
  test('reloads a loaded project once per burst of changes, and ignores unloaded ones', async () => {
    // Arrange
    vi.useFakeTimers()
    let notify: (projectId: string) => void = () => {}
    const project = vi.fn(async () => ok(usage(1)))
    setFakeDugout({
      usage: {
        project,
        onChange: (listener) => {
          notify = listener
          return () => {}
        },
      },
    })
    await store().load(PROJECT)
    const stop = watchUsageChanges()

    // Act
    notify(PROJECT)
    notify(PROJECT)
    notify('not-loaded')
    await vi.runAllTimersAsync()
    stop()

    // Assert
    expect(project).toHaveBeenCalledTimes(2)
    expect(project).not.toHaveBeenCalledWith('not-loaded')
  })
})
