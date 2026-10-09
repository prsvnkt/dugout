import type { Result } from '@shared/result'

/** A request's progress, as `useRequest` reports it. */
export type RequestState<T> =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly value: T }
  | { readonly kind: 'failed'; readonly message: string }

export const LOADING: RequestState<never> = { kind: 'loading' }

const FALLBACK_MESSAGE = 'Something went wrong.'

export function stateOf<T>(result: Result<T>): RequestState<T> {
  return result.ok
    ? { kind: 'loaded', value: result.data }
    : { kind: 'failed', message: result.error }
}

/**
 * Runs `load` and hands its settled state to `apply`. The returned function cancels: a result
 * that arrives afterwards is ignored. A rejected load (a broken IPC call, not a failed Result)
 * is warned about and reported as failed.
 */
export function startRequest<T>(
  load: () => Promise<Result<T>>,
  apply: (state: RequestState<T>) => void,
): () => void {
  let isCancelled = false
  load().then(
    (result) => {
      if (!isCancelled) apply(stateOf(result))
    },
    (error: unknown) => {
      if (isCancelled) return
      console.warn('[request] load failed', error)
      apply({ kind: 'failed', message: error instanceof Error ? error.message : FALLBACK_MESSAGE })
    },
  )
  return () => {
    isCancelled = true
  }
}

/** Whether two dependency lists hold the same items, compared the way React compares deps. */
export function haveSameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((item, index) => Object.is(item, b[index]))
}
