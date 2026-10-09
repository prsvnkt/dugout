import { useCallback, useEffect, useState } from 'react'
import type { AgentKind } from '@shared/agents'
import type { ProjectId } from '@shared/project'
import type { SessionTimeline } from '@shared/timeline'
import type { TimelineTarget } from '@renderer/features/editor/tabs'
import { dugout } from '@renderer/lib/dugout'

export type TimelineState =
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly timeline: SessionTimeline }
  | { readonly status: 'error'; readonly message: string }

async function fetchTimeline(agent: AgentKind, sessionId: string): Promise<TimelineState> {
  const result = await dugout.timeline.session(agent, sessionId)
  if (result.ok) return { status: 'loaded', timeline: result.data }
  console.warn('[timeline] could not load a session timeline:', result.error)
  return { status: 'error', message: result.error }
}

/**
 * A session's timeline while its tab is shown. It reloads when the project's agents report new
 * transcript lines (the same hook events that update token usage), so a working agent's
 * timeline grows as it goes; `reload` refreshes it on request. The view remounts per session
 * (keyed by tab), so the state starts as loading.
 */
export function useSessionTimeline(projectId: ProjectId, target: TimelineTarget) {
  const { agent, sessionId } = target
  const [state, setState] = useState<TimelineState>({ status: 'loading' })

  useEffect(() => {
    let isCurrent = true
    // Hook events come in bursts while an agent works: one read at a time, plus one after it.
    let isFetching = false
    let isQueued = false
    const load = (): void => {
      if (isFetching) {
        isQueued = true
        return
      }
      isFetching = true
      void fetchTimeline(agent, sessionId).then((next) => {
        isFetching = false
        if (!isCurrent) return
        setState(next)
        if (isQueued) {
          isQueued = false
          load()
        }
      })
    }
    load()
    const unsubscribe = dugout.usage.onChange((changed) => {
      if (changed === projectId) load()
    })
    return () => {
      isCurrent = false
      unsubscribe()
    }
  }, [agent, sessionId, projectId])

  const reload = useCallback(
    () => void fetchTimeline(agent, sessionId).then(setState),
    [agent, sessionId],
  )
  return { state, reload }
}
