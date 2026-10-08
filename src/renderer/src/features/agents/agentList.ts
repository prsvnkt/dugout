import { AGENT_LABEL, isAgentKind } from '@shared/terminal'
import type { PaneActivity } from '@renderer/features/workspace/paneActivity'
import {
  paneNumber,
  type PaneId,
  type PaneTask,
  type ProjectLayout,
} from '@renderer/features/workspace/layout'
import type { PaneDetail } from '@renderer/features/workspace/workspaceStore'
import { visibleSubagents, type Subagent } from './subagents'

/** Subagent lines shown under an agent before "+N more". */
export const MAX_SHOWN_SUBAGENTS = 5
const NO_SUBAGENTS: readonly Subagent[] = []

export interface AgentEntry {
  readonly paneId: PaneId
  /** The pane's position, as shown in its terminal header ("01", "02"…). */
  readonly number: string
  readonly agentLabel: string
  readonly activity: PaneActivity
  readonly detail: string | null
  readonly task: PaneTask | null
  readonly title: string | null
  /** The worktree branch, or null for the main checkout. */
  readonly branch: string | null
  readonly isFocused: boolean
  /** Its subagents to show, running first. */
  readonly subagents: readonly Subagent[]
  /** How many more subagents there are than shown. */
  readonly hiddenSubagents: number
}

export interface AgentListSource {
  readonly layout: ProjectLayout
  readonly activities: Readonly<Record<PaneId, PaneActivity>>
  readonly details: Readonly<Record<PaneId, PaneDetail>>
  readonly subagents: Readonly<Record<PaneId, readonly Subagent[]>>
}

/** A project's agents (not shells) in terminal order, for the sidebar's Agents list. */
export function agentEntries(source: AgentListSource): AgentEntry[] {
  const { layout, activities, details } = source
  return layout.panes.flatMap((pane, index): AgentEntry[] => {
    if (!isAgentKind(pane.kind)) return []
    const { shown, hiddenCount } = visibleSubagents(
      source.subagents[pane.id] ?? NO_SUBAGENTS,
      MAX_SHOWN_SUBAGENTS,
    )
    return [
      {
        paneId: pane.id,
        number: paneNumber(index),
        agentLabel: AGENT_LABEL[pane.kind],
        activity: activities[pane.id] ?? 'starting',
        detail: details[pane.id]?.detail ?? null,
        task: pane.task ?? null,
        title: pane.title ?? null,
        branch: pane.worktree?.branch ?? null,
        isFocused: layout.focusedPaneId === pane.id,
        subagents: shown,
        hiddenSubagents: hiddenCount,
      },
    ]
  })
}
