import { ListTree } from 'lucide-react'
import type { AgentKind } from '@shared/agents'
import type { ProjectId } from '@shared/project'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { Icon } from '@renderer/lib/Icon'
import { hasTimeline, timelineTitle } from './timelineFormat'

interface TimelineButtonProps {
  readonly projectId: ProjectId
  readonly agent: AgentKind
  /** The agent's session; without one (not started yet) there is nothing to show. */
  readonly sessionId: string | null | undefined
  /** The task the agent works on, to name the tab. */
  readonly taskKey?: string | undefined
  readonly className?: string | undefined
}

/** An agent header's icon button that opens its session's timeline in an editor tab. */
export function TimelineButton({
  projectId,
  agent,
  sessionId,
  taskKey,
  className,
}: TimelineButtonProps) {
  const openTimeline = useEditorStore((state) => state.openTimeline)
  if (!sessionId || !hasTimeline(agent)) return null
  return (
    <button
      className={className}
      onClick={() => openTimeline(projectId, { agent, sessionId }, timelineTitle(agent, taskKey))}
      onMouseDown={(event) => event.stopPropagation()}
      aria-label="Open session timeline"
      title="Session timeline: prompts, tool calls, files touched"
    >
      <Icon icon={ListTree} />
    </button>
  )
}
