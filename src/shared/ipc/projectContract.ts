import { z } from 'zod'
import { MAX_CHECK_COMMAND_LENGTH } from '../checks'
import { isOneLineCommand, MAX_DEV_COMMAND_LENGTH } from '../preview'
import { MAX_PROJECT_NAME_LENGTH, PROJECT_COLORS } from '../project'
import { LINEAR_TEAM_KEY_PATTERN, MAX_TASK_TITLE_LENGTH } from '../tasks'
import { MAX_MAX_AGENTS, MAX_TASK_KEY_LENGTH, MIN_MAX_AGENTS } from '../taskQueue'
import { AGENT_KINDS } from '../terminal'
import {
  isSafeCopyPattern,
  MAX_COPY_PATTERN_LENGTH,
  MAX_COPY_PATTERNS,
  MAX_SETUP_COMMAND_LENGTH,
} from '../worktreeSetup'
import { absolutePath, projectId } from './fields'

/**
 * Schemas for project IPC, and the project fields projects.json stores
 * (`shared/persistence/projectsFile.ts` builds on them).
 */

export const projectName = z.string().trim().min(1).max(MAX_PROJECT_NAME_LENGTH)
export const projectColor = z.enum(PROJECT_COLORS)

/** Name and colour are not chosen: the name is the repo folder's, the colour is random. */
export const projectAddRequestSchema = z.object({ rootPath: absolutePath })

export const projectRemoveRequestSchema = z.object({ id: projectId })

/** The command "Run" types into a new shell, e.g. `npm run dev`. One line. */
export const devCommand = z
  .string()
  .trim()
  .max(MAX_DEV_COMMAND_LENGTH)
  .refine(isOneLineCommand, 'The dev command must be one line')

/** null or blank clears the project's dev command. */
export const projectSetDevCommandRequestSchema = z.object({
  id: projectId,
  command: devCommand.nullable(),
})

/** Verify on Stop's command, as typed into a shell, e.g. `npm run check`. One line. */
export const checkCommand = z
  .string()
  .max(MAX_CHECK_COMMAND_LENGTH)
  .refine(isOneLineCommand, 'The check command must be one line')

/** `null` or blank turns Verify on Stop off for the project. */
export const projectSetCheckCommandRequestSchema = z.object({
  id: projectId,
  command: checkCommand.nullable(),
})

/** Files to copy into new worktrees and the command to run there (decision 038). */
export const worktreeSetupSchema = z.object({
  copy: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(MAX_COPY_PATTERN_LENGTH)
        .refine(isSafeCopyPattern, 'Copy patterns must stay inside the repository'),
    )
    .max(MAX_COPY_PATTERNS),
  command: z
    .string()
    .trim()
    .min(1)
    .max(MAX_SETUP_COMMAND_LENGTH)
    .refine(isOneLineCommand, 'The setup command must be one line')
    .optional(),
})

/** null (or a setup that copies and runs nothing) turns worktree setup off. */
export const projectSetWorktreeSetupRequestSchema = z.object({
  id: projectId,
  setup: worktreeSetupSchema.nullable(),
})

export const taskSourceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('github') }),
  z.object({ kind: z.literal('linear'), teamKey: z.string().regex(LINEAR_TEAM_KEY_PATTERN) }),
])

export const projectSetTaskSourceRequestSchema = z.object({
  projectId,
  source: taskSourceSchema,
})

/** How many agents a project runs at once when it starts queued tasks (decision 047). */
export const maxAgents = z.number().int().min(MIN_MAX_AGENTS).max(MAX_MAX_AGENTS)

const queuedTaskNumber = z.number().int().positive()

/** A task waiting in its project's queue for a free agent slot. */
export const queuedTaskSchema = z.object({
  number: queuedTaskNumber,
  key: z.string().trim().min(1).max(MAX_TASK_KEY_LENGTH),
  title: z.string().max(MAX_TASK_TITLE_LENGTH),
  agent: z.enum(AGENT_KINDS),
})

export const projectChangeTaskQueueRequestSchema = z.object({
  id: projectId,
  change: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('add'), task: queuedTaskSchema }),
    z.object({ kind: z.literal('remove'), number: queuedTaskNumber }),
    z.object({
      kind: z.literal('move'),
      number: queuedTaskNumber,
      offset: z.union([z.literal(-1), z.literal(1)]),
    }),
  ]),
})

export const projectSetMaxAgentsRequestSchema = z.object({ id: projectId, maxAgents })

export type ProjectAddRequest = z.infer<typeof projectAddRequestSchema>
