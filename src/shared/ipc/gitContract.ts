import { z } from 'zod'
import { MAX_COMPARED_WORKTREES } from '../compare'
import {
  MAX_BRANCH_NAME_LENGTH,
  MAX_COMMIT_MESSAGE_LENGTH,
  MAX_GIT_PATHS_PER_REQUEST,
} from '../git'
import { absolutePath, checkoutFields, projectId, repoRelativePath } from './fields'

/** Schemas for the Git panel's IPC: status, staging, commits, branches, worktrees, compare. */

/** Targets the project's main checkout, or one of its worktrees when `worktreePath` is set. */
export const gitProjectRequestSchema = z.object(checkoutFields)

/** A pull request of the checkout's GitHub repo, by number. */
export const gitPullRequestRequestSchema = gitProjectRequestSchema.extend({
  number: z.number().int().positive(),
})

export const gitPathsRequestSchema = z.object({
  ...checkoutFields,
  paths: z.array(repoRelativePath).min(1).max(MAX_GIT_PATHS_PER_REQUEST),
})

export const gitCommitRequestSchema = z.object({
  ...checkoutFields,
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
  ...checkoutFields,
  kind: z.enum(['local', 'remote']),
  name: branchName,
})

export const gitCreateBranchRequestSchema = z.object({
  ...checkoutFields,
  name: branchName,
  /** An existing branch to start from; HEAD when omitted. */
  startPoint: branchName.optional(),
})

export const gitShowRequestSchema = z.object({
  ...checkoutFields,
  path: repoRelativePath,
  revision: z.enum(['HEAD', 'INDEX']),
})

export type GitProjectRequest = z.infer<typeof gitProjectRequestSchema>

export const worktreeRemoveRequestSchema = z.object({ projectId, path: absolutePath })

export const compareChangesRequestSchema = z.object({
  projectId,
  worktreePaths: z.array(absolutePath).min(2).max(MAX_COMPARED_WORKTREES),
})
