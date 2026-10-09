import { useMemo } from 'react'
import { ListTree } from 'lucide-react'
import type { ProjectId } from '@shared/project'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { useWorkspaceStore } from '@renderer/features/workspace/workspaceStore'
import { Icon } from '@renderer/lib/Icon'
import { taskSessions } from './taskSessions'
import { timelineTitle } from './timelineFormat'

interface TaskTimelinesProps {
  readonly projectId: ProjectId
  readonly taskNumber: number
  /** "#12" or "ENG-12", to name the tabs. */
  readonly taskKey: string
  readonly className?: string | undefined
}

/** A task tab's buttons to open the timeline of each agent session that worked on it. */
export function TaskTimelines({ projectId, taskNumber, taskKey, className }: TaskTimelinesProps) {
  const panes = useWorkspaceStore((state) => state.layouts[projectId]?.panes)
  const recent = useWorkspaceStore((state) => state.recentSessions[projectId])
  const openTimeline = useEditorStore((state) => state.openTimeline)
  const sessions = useMemo(
    () => taskSessions(panes ?? [], recent ?? [], taskNumber),
    [panes, recent, taskNumber],
  )
  return sessions.map(({ agent, sessionId, label }) => (
    <button
      key={sessionId}
      className={className}
      onClick={() => openTimeline(projectId, { agent, sessionId }, timelineTitle(agent, taskKey))}
      title="This session's prompts, tool calls and files touched"
    >
      <Icon icon={ListTree} />
      {label} timeline
    </button>
  ))
}
