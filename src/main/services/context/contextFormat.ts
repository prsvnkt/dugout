import { z } from 'zod'
import { AGENT_KINDS } from '@shared/agents'
import {
  MAX_CONTEXT_TITLE_LENGTH,
  type ContextEntry,
  type ContextProposal,
  type ContextScope,
} from '@shared/context'
import { contextUrl } from '@shared/ipc/contextContract'
import { repoRelativePath } from '@shared/ipc/contract'

/**
 * Context entries are markdown files with a small front matter block of `key: value` lines
 * (values JSON-quoted when written). People may edit them, or drop plain markdown files in:
 * a file without front matter is a note titled by its first heading.
 */

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const HEADING = /^#{1,6}\s+(.+)$/m
const LINE = /^([A-Za-z]+):\s*(.*)$/

const title = z.string().trim().min(1).max(MAX_CONTEXT_TITLE_LENGTH)
const text = z.string().min(1).max(4096)

const subjectSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note') }),
  z.object({ kind: z.literal('file'), path: repoRelativePath, hash: text }),
  z.object({ kind: z.literal('link'), url: contextUrl }),
  z.object({ kind: z.literal('doc'), source: text }),
  z.object({ kind: z.literal('codemap'), agent: z.enum(AGENT_KINDS) }),
])

function parseValue(raw: string): unknown {
  if (!raw.startsWith('"')) return raw.trim()
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw.trim()
  }
}

/** Front matter fields (unknown keys kept, values unvalidated) and the body after it. */
export function splitFrontMatter(content: string): {
  fields: Record<string, unknown>
  body: string
} {
  const match = FRONT_MATTER.exec(content)
  if (!match) return { fields: {}, body: content }
  const fields: Record<string, unknown> = {}
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const field = LINE.exec(line)
    if (field?.[1]) fields[field[1]] = parseValue(field[2] ?? '')
  }
  return { fields, body: content.slice(match[0].length).replace(/^\r?\n/, '') }
}

function titleOf(fields: Record<string, unknown>, body: string, id: string): string {
  const parsed = title.safeParse(fields.title)
  if (parsed.success) return parsed.data
  return HEADING.exec(body)?.[1]?.trim().slice(0, MAX_CONTEXT_TITLE_LENGTH) || id
}

/**
 * Reads an entry file. Unknown or broken fields make it a plain note rather than hiding it, so
 * a hand-edited file stays visible.
 */
export function parseEntry(
  id: string,
  scope: ContextScope,
  content: string,
  fallbackDate: string,
): ContextEntry {
  const { fields, body } = splitFrontMatter(content)
  const subject = subjectSchema.safeParse({ ...fields, kind: fields.kind ?? 'note' })
  const updated = typeof fields.updated === 'string' ? fields.updated : fallbackDate
  return {
    id,
    scope,
    title: titleOf(fields, body, id),
    body,
    updatedAt: updated,
    ...(subject.success ? subject.data : { kind: 'note' }),
  }
}

function frontMatter(fields: Record<string, string | undefined>): string {
  const lines = Object.entries(fields)
    .filter((field): field is [string, string] => field[1] !== undefined)
    .map(([key, value]) => `${key}: ${key === 'kind' ? value : JSON.stringify(value)}`)
  return `---\n${lines.join('\n')}\n---\n\n`
}

/** The file an entry is saved as. */
export function serializeEntry(entry: ContextEntry): string {
  const subject: Record<string, string | undefined> = {
    path: entry.kind === 'file' ? entry.path : undefined,
    hash: entry.kind === 'file' ? entry.hash : undefined,
    url: entry.kind === 'link' ? entry.url : undefined,
    source: entry.kind === 'doc' ? entry.source : undefined,
    agent: entry.kind === 'codemap' ? entry.agent : undefined,
  }
  const body = entry.body.endsWith('\n') || entry.body === '' ? entry.body : `${entry.body}\n`
  return (
    frontMatter({ kind: entry.kind, title: entry.title, ...subject, updated: entry.updatedAt }) +
    body
  )
}

/** Proposals are kept in app data in the same format, with who proposed them. */
export function serializeProposal(proposal: ContextProposal): string {
  return (
    frontMatter({
      kind: 'note',
      title: proposal.title,
      proposedBy: proposal.proposedBy ?? undefined,
      created: proposal.createdAt,
    }) + proposal.body
  )
}

export function parseProposal(id: string, content: string, fallbackDate: string): ContextProposal {
  const { fields, body } = splitFrontMatter(content)
  const agent = z.enum(AGENT_KINDS).safeParse(fields.proposedBy)
  return {
    id,
    title: titleOf(fields, body, id),
    body,
    proposedBy: agent.success ? agent.data : null,
    createdAt: typeof fields.created === 'string' ? fields.created : fallbackDate,
  }
}
