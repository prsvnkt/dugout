import { z } from 'zod'
import { MAX_OPEN_FILE_BYTES } from '../files'
import { MAX_GIT_PATHS_PER_REQUEST } from '../git'
import { EXTERNAL_APP_IDS } from '../openIn'
import { checkoutFields, repoRelativePath } from './fields'

/** Schemas for the explorer and editor's file access, and opening a checkout in another app. */

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

export const openInRequestSchema = z.object({ ...checkoutFields, app: z.enum(EXTERNAL_APP_IDS) })
