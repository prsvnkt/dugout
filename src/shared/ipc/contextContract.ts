import { z } from 'zod'
import { AGENT_KINDS } from '../agents'
import {
  CONTEXT_ID_PATTERN,
  CONTEXT_SCOPES,
  MAX_CONTEXT_BODY_LENGTH,
  MAX_CONTEXT_SEARCH_LENGTH,
  MAX_CONTEXT_TITLE_LENGTH,
  MAX_CONTEXT_URL_LENGTH,
  MAX_PROPOSED_NOTE_LENGTH,
} from '../context'
import { repoRelativePath } from './contract'

/** Schemas for project context: the Context tab's IPC and the agents' context tools. */

const projectId = z.string().min(1).max(64)
export const contextId = z.string().regex(CONTEXT_ID_PATTERN, 'Not a context entry id')
const title = z.string().trim().min(1).max(MAX_CONTEXT_TITLE_LENGTH)
const body = z.string().max(MAX_CONTEXT_BODY_LENGTH)
/** Only web links: entries are opened in the browser. */
export const contextUrl = z.url({ protocol: /^https?$/ }).max(MAX_CONTEXT_URL_LENGTH)

export const contextEntryInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), scope: z.enum(CONTEXT_SCOPES), title, body }),
  z.object({
    kind: z.literal('file'),
    scope: z.enum(CONTEXT_SCOPES),
    title,
    body,
    path: repoRelativePath,
  }),
  z.object({
    kind: z.literal('link'),
    scope: z.enum(CONTEXT_SCOPES),
    title,
    body,
    url: contextUrl,
  }),
])

export const contextProjectRequestSchema = z.object({ projectId })
export const contextAddRequestSchema = z.object({ projectId, entry: contextEntryInputSchema })
export const contextEditRequestSchema = z.object({ projectId, id: contextId, title, body })
export const contextIdRequestSchema = z.object({ projectId, id: contextId })
export const contextImportRequestSchema = z.object({ projectId, scope: z.enum(CONTEXT_SCOPES) })
export const contextCodemapRequestSchema = z.object({ projectId, agent: z.enum(AGENT_KINDS) })

/** Context tool arguments from an agent's MCP server (the project comes from its terminal). */
export const contextRpcSchemas = {
  list: z.object({}),
  get: z.object({ id: contextId }),
  search: z.object({ query: z.string().trim().min(1).max(MAX_CONTEXT_SEARCH_LENGTH) }),
  addNote: z.object({ title, body: z.string().trim().min(1).max(MAX_PROPOSED_NOTE_LENGTH) }),
} as const
