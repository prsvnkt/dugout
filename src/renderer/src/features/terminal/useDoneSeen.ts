import { useEffect, useState } from 'react'
import type { AgentStatus } from '@shared/agentStatus'

/**
 * "Done" works like an unread badge: it clears once the user has looked at the pane, i.e. the
 * pane is focused in the visible project while the window has focus.
 */
export function useDoneSeen(agentStatus: AgentStatus | null, isInView: boolean): boolean {
  const [seenStatus, setSeenStatus] = useState<AgentStatus | null>(null)

  useEffect(() => {
    if (agentStatus !== 'done' || !isInView) return
    const markSeen = () => setSeenStatus('done')
    const timer = document.hasFocus() ? window.setTimeout(markSeen, 0) : undefined
    window.addEventListener('focus', markSeen)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('focus', markSeen)
    }
  }, [agentStatus, isInView])

  // Leaving "done" resets the seen flag so the next finished turn shows again.
  if (agentStatus !== 'done' && seenStatus !== null) setSeenStatus(null)
  return agentStatus === 'done' && seenStatus === 'done'
}
