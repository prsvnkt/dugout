import { z } from 'zod'
import { MAX_OPEN_FILE_BYTES } from '../files'
import { MAX_TASK_BODY_LENGTH, MAX_TASK_TITLE_LENGTH, TASK_STATUSES } from '../tasks'
import { MAX_COMMIT_MESSAGE_LENGTH, MAX_GIT_PATHS_PER_REQUEST } from '../git'
import { MAX_PROJECT_NAME_LENGTH, PROJECT_COLORS } from '../project'
import { AGENT_KINDS, TERMINAL_KINDS } from '../terminal'

/** Schemas for IPC payloads. Main validates every incoming payload; never trust the renderer. */

const MAX_TERMINAL_DIMENSION = 1000
const MAX_WRITE_BYTES = 1024 * 1024

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
  initialPrompt: z.string().min(1).max(10_000).optional(),
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

export const projectAddRequestSchema = z.object({
  name: projectName,
  rootPath: absolutePath,
  color: projectColor,
})

export const projectUpdateRequestSchema = z
  .object({
    id: projectId,
    name: projectName.optional(),
    color: projectColor.optional(),
  })
  .refine((request) => request.name !== undefined || request.color !== undefined, {
    message: 'Nothing to update',
  })

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
export type ProjectUpdateRequest = z.infer<typeof projectUpdateRequestSchema>
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

const savedPaneSchema = z.object({
  kind: z.enum(TERMINAL_KINDS),
  worktree: worktreeSchema.optional(),
  sessionId: sessionId.optional(),
  task: z.object({ number: z.number().int().positive(), title: z.string().max(256) }).optional(),
})

const MAX_SAVED_PANES = 12

/** On-disk format of workspace.json: each project's panes, restored on launch. */
export const workspaceSnapshotSchema = z.object({
  version: z.literal(1),
  projects: z.record(projectId, z.object({ panes: z.array(savedPaneSchema).max(MAX_SAVED_PANES) })),
})

export type SavedPane = z.infer<typeof savedPaneSchema>
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
