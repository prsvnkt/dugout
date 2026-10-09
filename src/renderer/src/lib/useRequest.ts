import { useEffect, useState, type DependencyList } from 'react'
import type { Result } from '@shared/result'
import { haveSameDeps, LOADING, startRequest, type RequestState } from './request'

export type { RequestState } from './request'

interface Settled<T> {
  readonly deps: DependencyList
  readonly state: RequestState<T>
}

/**
 * Loads once per `deps` (like `useEffect`) and reports loading, loaded or failed. When `deps`
 * change it reports loading again, and a result for older deps, or one arriving after unmount,
 * is ignored. ESLint checks `deps` like an effect's (`additionalHooks`).
 */
export function useRequest<T>(
  load: () => Promise<Result<T>>,
  deps: DependencyList,
): RequestState<T> {
  const [settled, setSettled] = useState<Settled<T> | null>(null)

  useEffect(
    () => startRequest(load, (state) => setSettled({ deps, state })),
    // The caller's deps decide when to load again; `load` is a fresh closure every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  )

  // Derived rather than reset in the effect, so a deps change never shows the old result.
  return settled && haveSameDeps(settled.deps, deps) ? settled.state : LOADING
}
