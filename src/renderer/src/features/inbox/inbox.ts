import type { Project, ProjectId } from '@shared/project'
import { AGENT_LABEL, isAgentKind } from '@shared/terminal'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'
import type { PaneId, ProjectLayout } from '@renderer/features/workspace/layout'
import type { PaneDetail } from '@renderer/features/workspace/workspaceStore'

export interface InboxEntry {
  readonly projectId: ProjectId
  readonly projectName: string
  readonly paneId: PaneId
  readonly activity: 'needs-input' | 'done'
  readonly agentLabel: string
  readonly taskNumber: number | null
  readonly detail: string | null
  readonly since: number
}

export interface InboxSource {
  readonly projects: readonly Project[]
  readonly layouts: Readonly<Record<ProjectId, ProjectLayout>>
  readonly activities: Readonly<Record<PaneId, PaneActivity>>
  readonly details: Readonly<Record<PaneId, PaneDetail>>
}

function isInboxActivity(activity: PaneActivity | undefined): activity is InboxEntry['activity'] {
  return activity === 'needs-input' || activity === 'done'
}

/** Agents across all projects that need you (first) or finished (unseen), newest first. */
export function inboxEntries(source: InboxSource): InboxEntry[] {
  const entries = source.projects.flatMap((project) =>
    (source.layouts[project.id]?.panes ?? []).flatMap((pane): InboxEntry[] => {
      const activity = source.activities[pane.id]
      if (!isInboxActivity(activity)) return []
      const detail = source.details[pane.id]
      return [
        {
          projectId: project.id,
          projectName: project.name,
          paneId: pane.id,
          activity,
          agentLabel: isAgentKind(pane.kind) ? AGENT_LABEL[pane.kind] : pane.kind,
          taskNumber: pane.task?.number ?? null,
          detail: detail?.detail ?? null,
          since: detail?.since ?? 0,
        },
      ]
    }),
  )
  const rank = (entry: InboxEntry) => (entry.activity === 'needs-input' ? 0 : 1)
  return entries.sort((a, b) => rank(a) - rank(b) || b.since - a.since)
}
