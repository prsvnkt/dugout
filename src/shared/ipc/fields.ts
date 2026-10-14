import { z } from 'zod'

/** Field schemas shared by several IPC domains and the persisted file formats. */

export const absolutePath = z
  .string()
  .min(1)
  .refine((path) => path.startsWith('/'), 'Path must be absolute')

export const projectId = z.string().min(1).max(64)

/** Agent session ids (e.g. UUIDs); this also rules out anything that could look like a flag. */
export const sessionId = z.string().regex(/^[A-Za-z0-9][\w-]{0,127}$/)

/** A path inside a repository: relative, with no `..` segments, so it cannot escape it. */
export const repoRelativePath = z
  .string()
  .min(1)
  .max(4096)
  .refine((path) => !path.includes('\0'), 'Invalid character in path')
  .refine((path) => !path.startsWith('/'), 'Path must be relative to the repository')
  .refine((path) => !path.split('/').includes('..'), 'Path must stay inside the repository')

/** Targets the project's main checkout, or one of its worktrees when `worktreePath` is set. */
export const checkoutFields = { projectId, worktreePath: absolutePath.optional() }

/** Identifies a set of approved `.mcp.json` servers (decision 057): a sha256 hex digest. */
export const serversHash = z.string().regex(/^[0-9a-f]{64}$/)
