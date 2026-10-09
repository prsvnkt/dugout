import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import {
  CONTEXT_ID_PATTERN,
  MAX_CONTEXT_SEARCH_LENGTH,
  MAX_CONTEXT_TITLE_LENGTH,
  MAX_PROPOSED_NOTE_LENGTH,
} from '@shared/context'
import { run, type DugoutRpc } from './rpcTool'
import { toolAnnotations } from './toolAccess'

// Dugout validates every call again in main; these schemas tell the agent what it may send.
const id = z.string().regex(CONTEXT_ID_PATTERN).describe('An entry id from list_context')

const LIST_DESCRIPTION =
  "List this project's context: knowledge the team curates for agents (notes, pinned files " +
  'and folders, links, documents, a codemap). Returns a small index of id, kind and title; ' +
  'read an entry with get_context. Check it before exploring the codebase from scratch. ' +
  'Pinned files marked "stale" changed since they were pinned.'

/**
 * Pull-based project context: a small index, one entry at a time, and search. Agents can only
 * propose notes; the user approves them in Dugout before they are shared.
 */
export function registerContextTools(server: McpServer, rpc: DugoutRpc): void {
  server.registerTool(
    'list_context',
    {
      description: LIST_DESCRIPTION,
      inputSchema: {},
      annotations: toolAnnotations('list_context'),
    },
    () => run(rpc, 'context.list', {}),
  )
  server.registerTool(
    'get_context',
    {
      annotations: toolAnnotations('get_context'),
      description: 'Read one context entry in full: its Markdown body, and its path or link.',
      inputSchema: { id },
    },
    (args) => run(rpc, 'context.get', args),
  )
  server.registerTool(
    'search_context',
    {
      annotations: toolAnnotations('search_context'),
      description:
        "Search the project's context: entries whose title, path, link or text contain every " +
        'word (any case), with a snippet of where they matched.',
      inputSchema: { query: z.string().min(1).max(MAX_CONTEXT_SEARCH_LENGTH) },
    },
    (args) => run(rpc, 'context.search', args),
  )
  server.registerTool(
    'add_note',
    {
      annotations: toolAnnotations('add_note'),
      description:
        'Propose a note for the project context: something the next agent should know (a ' +
        'decision, a gotcha, how to run or test something). It is shared only after the user ' +
        'approves it. Keep it short and specific; do not repeat what the code says.',
      inputSchema: {
        title: z.string().min(1).max(MAX_CONTEXT_TITLE_LENGTH),
        body: z.string().min(1).max(MAX_PROPOSED_NOTE_LENGTH).describe('Markdown'),
      },
    },
    (args) => run(rpc, 'context.addNote', args),
  )
}
