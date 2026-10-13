import { describe, expect, test, vi } from 'vitest'
import { fail, ok, type Result } from '@shared/result'
import { haveSameDeps, startRequest, stateOf, type RequestState } from './request'

/** A promise the test resolves or rejects by hand, to control when a request settles. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('stateOf', () => {
  test('turns a successful result into a loaded state carrying its data', () => {
    // Arrange
    const result = ok(['a', 'b'])

    // Act
    const state = stateOf(result)

    // Assert
    expect(state).toEqual({ kind: 'loaded', value: ['a', 'b'] })
  })

  test('turns a failed result into a failed state carrying its message', () => {
    // Arrange
    const result = fail<string[]>('Sign in to GitHub first.')

    // Act
    const state = stateOf(result)

    // Assert
    expect(state).toEqual({ kind: 'failed', message: 'Sign in to GitHub first.' })
  })
})

describe('startRequest', () => {
  test('hands the settled state to apply once the load resolves', async () => {
    // Arrange
    const apply = vi.fn<(state: RequestState<number>) => void>()

    // Act
    startRequest(() => Promise.resolve(ok(42)), apply)
    await flush()

    // Assert
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: 'loaded', value: 42 })
  })

  test('ignores a result that arrives after the request was cancelled', async () => {
    // Arrange
    const pending = deferred<Result<number>>()
    const apply = vi.fn<(state: RequestState<number>) => void>()
    const cancel = startRequest(() => pending.promise, apply)

    // Act
    cancel()
    pending.resolve(ok(42))
    await flush()

    // Assert
    expect(apply).not.toHaveBeenCalled()
  })

  test('reports a rejected load as failed with its message, and warns', async () => {
    // Arrange
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const apply = vi.fn<(state: RequestState<number>) => void>()

    // Act
    startRequest(() => Promise.reject(new Error('IPC channel closed')), apply)
    await flush()

    // Assert
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: 'failed',
      message: 'IPC channel closed',
    })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  test('ignores a rejection that arrives after the request was cancelled', async () => {
    // Arrange
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const pending = deferred<Result<number>>()
    const apply = vi.fn<(state: RequestState<number>) => void>()
    const cancel = startRequest(() => pending.promise, apply)

    // Act
    cancel()
    pending.reject(new Error('late'))
    await flush()

    // Assert
    expect(apply).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('haveSameDeps', () => {
  test('is true for lists with the same items in the same order', () => {
    // Arrange
    const shared = { id: 1 }

    // Act
    const same = haveSameDeps(['p1', shared, 3], ['p1', shared, 3])

    // Assert
    expect(same).toBe(true)
  })

  test('is false when any item changed identity', () => {
    // Arrange, Act
    const same = haveSameDeps(['p1', { id: 1 }], ['p1', { id: 1 }])

    // Assert
    expect(same).toBe(false)
  })

  test('is false when the lists differ in length', () => {
    // Arrange, Act
    const same = haveSameDeps([1], [1, 2])

    // Assert
    expect(same).toBe(false)
  })

  test('treats NaN as equal to itself, like React does', () => {
    // Arrange, Act
    const same = haveSameDeps([Number.NaN], [Number.NaN])

    // Assert
    expect(same).toBe(true)
  })
})
