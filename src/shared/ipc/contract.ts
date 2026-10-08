import { z } from 'zod'
import { MAX_OPEN_FILE_BYTES } from '../files'
import { MAX_TASK_BODY_LENGTH, MAX_TASK_TITLE_LENGTH, TASK_STATUSES } from '../tasks'
import {
  MAX_BRANCH_NAME_LENGTH,
  MAX_COMMIT_MESSAGE_LENGTH,
  MAX_GIT_PATHS_PER_REQUEST,
} from '../git'
import { MAX_PROJECT_NAME_LENGTH, PROJECT_COLORS } from '../project'
import { AGENT_KINDS, TERMINAL_KINDS } from '../terminal'

/** Schemas for IPC payloads. Main validates every incoming payload; never trust the renderer. */

const MAX_TERMINAL_DIMENSION = 1000
const MAX_WRITE_BYTES = 1024 * 1024

/** First message for a new agent session, e.g. from the start screen's prompt box. */
export const MAX_INITIAL_PROMPT_LENGTH = 10_000

const dimension = z.number().int().min(1).max(MAX_TERMINAL_DIMENSION)
const terminalId = z.string().min(1).max(64)
const absolutePath = z
  .string()
  .min(1)
  .refine((path) => path.startsWith('/'), 'Path must be absolute')

const projectIdField = z.string().min(1).max(64)
/** Claude session ids are UUIDs; this also rules out anything that could look like a flag. */
const sessionId = z.string().regex(/^[A-Za-z0-9][\w-]{0,127}$/)

export const terminalCreateRequestSchema = z.object({
  kind: z.enum(TERMINAL_KINDS),
  projectId: projectIdField,
  /** Continue this Claude conversation (`claude --resume`) instead of starting a new one. */
  resumeSessionId: sessionId.optional(),
  /** First message for a new Claude session (e.g. the task it was started for). */
  initialPrompt: z.string().min(1).max(MAX_INITIAL_PROMPT_LENGTH).optional(),
  cwd: absolutePath,
  cols: dimension,
  rows: dimension,
})

export const terminalWriteRequestSchema = z.object({
  id: terminalId,
  data: z.string().max(MAX_WRITE_BYTES),
})

export const terminalResizeRequestSchema = z.object({
  id: terminalId,
  cols: dimension,
  rows: dimension,
})

export const terminalKillRequestSchema = z.object({ id: terminalId })

export type TerminalCreateRequest = z.infer<typeof terminalCreateRequestSchema>
export type TerminalWriteRequest = z.infer<typeof terminalWriteRequestSchema>
export type TerminalResizeRequest = z.infer<typeof terminalResizeRequestSchema>
export type TerminalKillRequest = z.infer<typeof terminalKillRequestSchema>

const projectId = z.string().min(1).max(64)
const projectName = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH)
const projectColor = z.enum(PROJECT_COLORS)

/** Name and colour are not chosen: the name is the repo folder's, the colour is random. */
export const projectAddRequestSchema = z.object({ rootPath: absolutePath })

export const projectRemoveRequestSchema = z.object({ id: projectId })

export const projectSchema = z.object({
  id: projectId,
  name: projectName,
  rootPath: absolutePath,
  color: projectColor,
  createdAt: z.iso.datetime(),
})

/** On-disk format of projects.json. Bump `version` and migrate when it changes. */
export const projectsFileSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
})

export type ProjectAddRequest = z.infer<typeof projectAddRequestSchema>
export type ProjectRemoveRequest = z.infer<typeof projectRemoveRequestSchema>
export type ProjectsFile = z.infer<typeof projectsFileSchema>

/** A path inside a repository: relative, with no `..` segments, so it cannot escape it. */
const repoRelativePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('\0'), 'Invalid character in path')
  .refine((path) => !path.startsWith('/'), 'Path must be relative to the repository')
  .refine((path) => !path.split('/').includes('..'), 'Path must stay inside the repository')

/** Targets the project's main checkout, or one of its worktrees when `worktreePath` is set. */
export const gitProjectRequestSchema = z.object({
  projectId,
  worktreePath: absolutePath.optional(),
})

export const gitPathsRequestSchema = z.object({
  projectId,
  worktreePath: absolutePath.optional(),
  paths: z.array(repoRelativePath).min(1).max(MAX_GIT_PATHS_PER_REQUEST),
})

export const gitCommitRequestSchema = z.object({
  projectId,
  worktreePath: absolutePath.optional(),
  message: z.string().trim().min(1).max(MAX_COMMIT_MESSAGE_LENGTH),
  /** Stage every change (including new files) first: VS Code's "smart commit". */
  includeAll: z.boolean().default(false),
})

const DELETE_CHAR_CODE = 0x7f
const FIRST_PRINTABLE_CHAR_CODE = 0x20

function isSpaceOrControl(char: string): boolean {
  const code = char.charCodeAt(0)
  return code < FIRST_PRINTABLE_CHAR_CODE || code === DELETE_CHAR_CODE || /\s/.test(char)
}

/** A branch name; git checks the full rules, this keeps out option-like and control input. */
const branchName = z
  .string()
  .trim()
  .min(1)
  .max(MAX_BRANCH_NAME_LENGTH)
  .refine((name) => !name.startsWith('-'), 'Branch names cannot start with "-"')
  .refine((name) => ![...name].some(isSpaceOrControl), 'Branch names cannot contain spaces')

export const gitSwitchBranchRequestSchema = z.object({
  projectId,
  worktreePath: absolutePath.optional(),
  kind: z.enum(['local', 'remote']),
  name: branchName,
})

export const gitCreateBranchRequestSchema = z.object({
  projectId,
  worktreePath: absolutePath.optional(),
  name: branchName,
  /** An existing branch to start from; HEAD when omitted. */
  startPoint: branchName.optional(),
})

export type GitProjectRequest = z.infer<typeof gitProjectRequestSchema>
export type GitPathsRequest = z.infer<typeof gitPathsRequestSchema>
export type GitCommitRequest = z.infer<typeof gitCommitRequestSchema>

export const worktreeRemoveRequestSchema = z.object({ projectId, path: absolutePath })

export type WorktreeRemoveRequest = z.infer<typeof worktreeRemoveRequestSchema>

const worktreeSchema = z.object({
  path: absolutePath,
  branch: z.string().max(255).nullable(),
  name: z.string().min(1).max(64),
})

const MAX_PANE_TITLE_LENGTH = 256
const paneTitle = z.string().min(1).max(MAX_PANE_TITLE_LENGTH)
const paneTaskSchema = z.object({
  number: z.number().int().positive(),
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
export { sessionId as sessionIdSchema }

const checkoutFields = { projectId, worktreePath: absolutePath.optional() }

export const filesReadDirRequestSchema = z.object({
  ...checkoutFields,
  /** '' lists the checkout root. */
  path: z.union([z.literal(''), repoRelativePath]),
})

export const filesReadRequestSchema = z.object({ ...checkoutFields, path: repoRelativePath })

export const filesStatRequestSchema = z.object({
  ...checkoutFields,
  paths: z.array(repoRelativePath).max(MAX_GIT_PATHS_PER_REQUEST),
})

export const filesWriteRequestSchema = z.object({
  ...checkoutFields,
  path: repoRelativePath,
  content: z.string().max(MAX_OPEN_FILE_BYTES),
  /** mtime when the file was opened; null skips the check (e.g. after "Keep mine"). */
  expectedMtimeMs: z.number().nullable(),
  force: z.boolean().optional(),
})

export const gitShowRequestSchema = z.object({
  ...checkoutFields,
  path: repoRelativePath,
  revision: z.enum(['HEAD', 'INDEX']),
})

export type FilesWriteRequest = z.infer<typeof filesWriteRequestSchema>

/** https, ssh (incl. scp-style git@host:path), file:// or an absolute local path. Never an option. */
const cloneUrl = z
  .string()
  .min(1)
  .max(2048)
  .regex(
    /^(https?:\/\/|ssh:\/\/|file:\/\/|[\w.-]+@[\w.-]+:|\/)\S+$/,
    'Enter an https, ssh or local repository URL',
  )

const folderName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\w.][\w.-]*$/, 'Use letters, numbers, dots, dashes or underscores')
  .refine((name) => name !== '.' && name !== '..', 'Choose a folder name')

export const cloneRequestSchema = z.object({ url: cloneUrl, parentDir: absolutePath, folderName })

export type CloneRequest = z.infer<typeof cloneRequestSchema>

const taskNumber = z.number().int().positive()
const taskTitle = z.string().trim().min(1).max(MAX_TASK_TITLE_LENGTH)
const taskBody = z.string().max(MAX_TASK_BODY_LENGTH)
const taskStatus = z.enum(TASK_STATUSES)

/** Task tool arguments sent by an agent's MCP server (the project comes from its terminal). */
export const taskRpcSchemas = {
  list: z.object({ status: taskStatus.optional() }),
  get: z.object({ number: taskNumber }),
  create: z.object({ title: taskTitle, body: taskBody.default('') }),
  update: z.object({
    number: taskNumber,
    title: taskTitle.optional(),
    body: taskBody.optional(),
    status: taskStatus.optional(),
  }),
  comment: z.object({
    number: taskNumber,
    body: z.string().trim().min(1).max(MAX_TASK_BODY_LENGTH),
  }),
} as const

export const taskListRequestSchema = z.object({ projectId })
export const taskNumberRequestSchema = z.object({ projectId, number: taskNumber })
export const taskStartSessionRequestSchema = taskNumberRequestSchema.extend({
  agents: z.array(z.enum(AGENT_KINDS)).min(1).max(AGENT_KINDS.length),
})
export const taskCreateRequestSchema = taskRpcSchemas.create.extend({ projectId })
export const taskUpdateRequestSchema = taskRpcSchemas.update.extend({ projectId })
export const taskCommentRequestSchema = taskRpcSchemas.comment.extend({ projectId })

export type TaskCreateRequest = z.input<typeof taskCreateRequestSchema>
export type TaskUpdateRequest = z.input<typeof taskUpdateRequestSchema>

export const compareChangesRequestSchema = z.object({
  projectId,
  worktreePaths: z.array(absolutePath).min(2).max(4),
})

const mcpRecord = z.record(z.string().min(1).max(256), z.string().max(4096))
const mcpServerName = z.string().min(1).max(128)
export const mcpServerSchema = z.discriminatedUnion('type', [
  z.object({
    name: mcpServerName,
    type: z.literal('stdio'),
    command: z.string().trim().min(1).max(4096),
    args: z.array(z.string().max(4096)).max(100),
    env: mcpRecord,
  }),
  z.object({
    name: mcpServerName,
    type: z.enum(['http', 'sse']),
    url: z
      .string()
      .max(4096)
      .refine(
        (value) => /^https?:\/\//.test(value) || value.startsWith('${'),
        'Use an http(s) URL.',
      ),
    headers: mcpRecord,
  }),
])
export const agentConfigRequestSchema = z.object({ projectId })
export const agentConfigSaveMcpRequestSchema = z.object({
  projectId,
  version: z.string().max(128),
  servers: z
    .array(mcpServerSchema)
    .max(100)
    .refine(
      (servers) => new Set(servers.map((s) => s.name)).size === servers.length,
      'Server names must be unique.',
    ),
})

export const settingsUpdateRequestSchema = z.object({ defaultAgent: z.enum(AGENT_KINDS) })
export type SettingsUpdateRequest = z.infer<typeof settingsUpdateRequestSchema>
