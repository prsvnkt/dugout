import { z } from 'zod'
import { absolutePath, projectId, sessionId } from '../ipc/fields'
import { AGENT_KINDS, TERMINAL_KINDS } from '../terminal'

const worktreeSchema = z.object({
  path: absolutePath,
  branch: z.string().max(255).nullable(),
  name: z.string().min(1).max(64),
})

const MAX_PANE_TITLE_LENGTH = 256
const paneTitle = z.string().min(1).max(MAX_PANE_TITLE_LENGTH)
const paneTaskSchema = z.object({
  number: z.number().int().positive(),
  /** "#12" or "ENG-12"; missing in layouts saved before Linear tasks. */
  key: z.string().min(1).max(32).optional(),
  title: z.string().max(MAX_PANE_TITLE_LENGTH),
})

const savedPaneSchema = z.object({
  kind: z.enum(TERMINAL_KINDS),
  worktree: worktreeSchema.optional(),
  sessionId: sessionId.optional(),
  task: paneTaskSchema.optional(),
  title: paneTitle.optional(),
})

/** An agent session closed from a project, offered on its start screen to resume. */
const recentSessionSchema = z.object({
  kind: z.enum(AGENT_KINDS),
  sessionId,
  closedAt: z.number().int().nonnegative(),
  title: paneTitle.optional(),
  task: paneTaskSchema.optional(),
  worktree: worktreeSchema.optional(),
})

const MAX_SAVED_PANES = 12
/** How many closed sessions each project remembers. */
export const MAX_RECENT_SESSIONS = 5

/** On-disk format of workspace.json: each project's panes, restored on launch. */
export const workspaceSnapshotSchema = z.object({
  version: z.literal(1),
  projects: z.record(
    projectId,
    z.object({
      panes: z.array(savedPaneSchema).max(MAX_SAVED_PANES),
      recent: z.array(recentSessionSchema).max(MAX_RECENT_SESSIONS).optional(),
    }),
  ),
})

export type SavedPane = z.infer<typeof savedPaneSchema>
export type SavedRecentSession = z.infer<typeof recentSessionSchema>
export type WorkspaceSnapshot = z.infer<typeof workspaceSnapshotSchema>
