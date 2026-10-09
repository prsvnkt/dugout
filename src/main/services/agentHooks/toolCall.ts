import type { TextChange, ToolCallPreview, ToolField } from '@shared/toolCall'

/** The tool-related part of a hook payload (PermissionRequest, PostToolUse…), untrusted. */
export interface ToolPayload {
  readonly tool_name?: unknown
  readonly tool_use_id?: unknown
  readonly tool_input?: unknown
}

/**
 * Identifies one tool call across hooks. `PostToolUse` carries the CLI's tool id, but neither
 * Claude Code nor Codex sends it with `PermissionRequest`; there, `key` (the tool and its main
 * argument) is what ties the request to the tool finishing.
 */
export interface ToolCallRef {
  readonly toolUseId: string | null
  readonly key: string
}

/** Each long text in a preview is clipped to this many characters. */
export const MAX_PREVIEW_TEXT = 8000
const MAX_EDITS = 20
const MAX_FIELDS = 12
const MAX_TOOL_NAME = 128
/** Tool ids are short tokens (`toolu_…`, `call_…`); anything else is ignored. */
const TOOL_USE_ID = /^[\w-]{1,128}$/
const KEY_SEPARATOR = '\u0000'

type Input = Readonly<Record<string, unknown>>

function toolName(payload: ToolPayload): string | null {
  const name = typeof payload.tool_name === 'string' ? payload.tool_name.trim() : ''
  return name ? name.slice(0, MAX_TOOL_NAME) : null
}

function inputOf(payload: ToolPayload): Input {
  const input = payload.tool_input
  return input !== null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Input)
    : {}
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

/** A command as a string; Codex may send it as an argument list. */
function commandOf(input: Input): string | undefined {
  const command = input.command
  if (Array.isArray(command) && command.every((part) => typeof part === 'string'))
    return command.join(' ')
  return text(command)
}

function filePathOf(input: Input): string | undefined {
  return text(input.file_path) ?? text(input.notebook_path)
}

/** JSON with object keys sorted, so equal inputs give equal strings. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Input).sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** Which call a hook payload is about; null when it names no tool. */
export function toolCallRef(payload: ToolPayload): ToolCallRef | null {
  const tool = toolName(payload)
  if (!tool) return null
  const input = inputOf(payload)
  const id = payload.tool_use_id
  const argument = commandOf(input) ?? filePathOf(input) ?? text(input.url) ?? stableJson(input)
  return {
    toolUseId: typeof id === 'string' && TOOL_USE_ID.test(id) ? id : null,
    key: `${tool}${KEY_SEPARATOR}${argument}`,
  }
}

function clip(value: string): string {
  if (value.length <= MAX_PREVIEW_TEXT) return value
  const rest = value.length - MAX_PREVIEW_TEXT
  return `${value.slice(0, MAX_PREVIEW_TEXT)}\n… ${rest} more characters`
}

function changesOf(input: Input): TextChange[] {
  const change = (before: unknown, after: unknown): TextChange => ({
    before: clip(text(before) ?? ''),
    after: clip(text(after) ?? ''),
  })
  if (Array.isArray(input.edits)) {
    return input.edits
      .slice(0, MAX_EDITS)
      .map((edit: unknown) =>
        edit !== null && typeof edit === 'object'
          ? change((edit as Input).old_string, (edit as Input).new_string)
          : change('', ''),
      )
  }
  if (text(input.content) !== undefined) return [change('', input.content)]
  if (text(input.new_source) !== undefined) return [change('', input.new_source)]
  return [change(input.old_string, input.new_string)]
}

function fieldsOf(input: Input): ToolField[] {
  return Object.entries(input)
    .slice(0, MAX_FIELDS)
    .map(([name, value]) => ({
      name,
      value: clip(typeof value === 'string' ? value : stableJson(value)),
    }))
}

const EDIT_TOOLS: ReadonlySet<string> = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** The whole tool call, for the inbox to show before you approve it. */
export function toolCallPreview(payload: ToolPayload): ToolCallPreview | null {
  const tool = toolName(payload)
  if (!tool) return null
  const input = inputOf(payload)
  const command = commandOf(input)
  if (command !== undefined) {
    const description = text(input.description)?.trim()
    return { kind: 'command', tool, command: clip(command), description: description || null }
  }
  const filePath = filePathOf(input)
  if (filePath !== undefined && EDIT_TOOLS.has(tool))
    return { kind: 'edit', tool, filePath: clip(filePath), changes: changesOf(input) }
  return { kind: 'other', tool, fields: fieldsOf(input) }
}
