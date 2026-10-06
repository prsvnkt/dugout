import type { McpServer } from '@shared/agentConfig'

/** The editable text fields of one MCP server form. */
export interface ServerDraft {
  readonly name: string
  readonly type: McpServer['type']
  readonly command: string
  /** One argument per line. */
  readonly args: string
  readonly url: string
  /** `NAME=value` env lines (stdio) or `Name: value` header lines (http/sse). */
  readonly pairs: string
}

export const EMPTY_DRAFT: ServerDraft = {
  name: '',
  type: 'stdio',
  command: '',
  args: '',
  url: '',
  pairs: '',
}

export function draftFromServer(server: McpServer): ServerDraft {
  return server.type === 'stdio'
    ? {
        ...EMPTY_DRAFT,
        name: server.name,
        command: server.command,
        args: server.args.join('\n'),
        pairs: Object.entries(server.env)
          .map(([key, value]) => `${key}=${value}`)
          .join('\n'),
      }
    : {
        ...EMPTY_DRAFT,
        name: server.name,
        type: server.type,
        url: server.url,
        pairs: Object.entries(server.headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join('\n'),
      }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

function parsePairs(text: string, separator: '=' | ':'): Parsed<Record<string, string>> {
  const entries: [string, string][] = []
  for (const line of lines(text)) {
    const index = line.indexOf(separator)
    if (index <= 0) {
      const shape = separator === '=' ? 'each variable as NAME=value' : 'each header as Name: value'
      return { ok: false, error: `Write ${shape} ("${line}").` }
    }
    entries.push([line.slice(0, index).trim(), line.slice(index + 1).trim()])
  }
  return { ok: true, value: Object.fromEntries(entries) }
}

/** The server the form describes, or what to fix. `takenNames` excludes the server being edited. */
export function serverFromDraft(
  draft: ServerDraft,
  takenNames: readonly string[],
): { ok: true; server: McpServer } | { ok: false; error: string } {
  const name = draft.name.trim()
  if (!name) return { ok: false, error: 'Give the server a name.' }
  if (takenNames.includes(name))
    return { ok: false, error: `A server named "${name}" already exists.` }
  const pairs = parsePairs(draft.pairs, draft.type === 'stdio' ? '=' : ':')
  if (!pairs.ok) return pairs
  if (draft.type === 'stdio') {
    if (!draft.command.trim())
      return { ok: false, error: 'Enter the command that starts the server.' }
    return {
      ok: true,
      server: {
        name,
        type: 'stdio',
        command: draft.command.trim(),
        args: lines(draft.args),
        env: pairs.value,
      },
    }
  }
  if (!draft.url.trim()) return { ok: false, error: 'Enter the server URL.' }
  return {
    ok: true,
    server: { name, type: draft.type, url: draft.url.trim(), headers: pairs.value },
  }
}
