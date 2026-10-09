import type { TouchedFile } from '@shared/timeline'
import { displayPath, oneLine, type TimelineStep } from './timelineSteps'
import { asRecord, asString, parseLine } from './types'

/** Claude Code's tool for subagents (called `Task` in older versions). */
const SUBAGENT_TOOLS = new Set(['Agent', 'Task'])
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const READ_TOOLS = new Set(['Read'])
/** The argument that best says what a tool call did, by tool; others fall back to the first. */
const DETAIL_FIELDS: Readonly<Record<string, string>> = {
  Bash: 'command',
  Read: 'file_path',
  Edit: 'file_path',
  MultiEdit: 'file_path',
  Write: 'file_path',
  NotebookEdit: 'notebook_path',
  Glob: 'pattern',
  Grep: 'pattern',
  WebFetch: 'url',
  WebSearch: 'query',
  Agent: 'description',
  Task: 'description',
  Skill: 'skill',
}
const FALLBACK_FIELDS = ['command', 'file_path', 'path', 'pattern', 'query', 'url', 'description']
const PATH_FIELDS = new Set(['file_path', 'notebook_path', 'path'])

interface Context {
  readonly at: string
  readonly cwd: string | null
}

function detailOf(name: string, input: Record<string, unknown>, cwd: string | null) {
  const preferred = DETAIL_FIELDS[name]
  const field =
    (preferred && asString(input[preferred]) ? preferred : undefined) ??
    FALLBACK_FIELDS.find((key) => asString(input[key])) ??
    Object.keys(input).find((key) => asString(input[key]))
  const value = field ? asString(input[field]) : null
  if (!field || !value) return null
  return oneLine(PATH_FIELDS.has(field) ? displayPath(value, cwd) : value)
}

function filesOf(name: string, input: Record<string, unknown>, cwd: string | null): TouchedFile[] {
  const path = asString(input.file_path) ?? asString(input.notebook_path)
  if (!path) return []
  if (EDIT_TOOLS.has(name)) return [{ path: displayPath(path, cwd), change: 'edited' }]
  if (READ_TOOLS.has(name)) return [{ path: displayPath(path, cwd), change: 'read' }]
  return []
}

function toolCall(block: Record<string, unknown>, { at, cwd }: Context): TimelineStep | null {
  const id = asString(block.id)
  const name = asString(block.name)
  if (!id || !name) return null
  const input = asRecord(block.input) ?? {}
  const isSubagent = SUBAGENT_TOOLS.has(name)
  return {
    kind: 'call',
    at,
    id,
    name,
    detail: detailOf(name, input, cwd),
    subagent: isSubagent ? { agentType: asString(input.subagent_type) } : null,
    files: filesOf(name, input, cwd),
  }
}

function assistantSteps(entry: Record<string, unknown>, context: Context): TimelineStep[] {
  const message = asRecord(entry.message)
  const content = Array.isArray(message?.content) ? message.content : []
  const replyKey = asString(message?.id) ?? asString(entry.uuid) ?? context.at
  return content.flatMap((item: unknown, index): TimelineStep[] => {
    const block = asRecord(item)
    if (block?.type === 'tool_use') return [toolCall(block, context)].filter((s) => s !== null)
    const text = block?.type === 'text' ? asString(block.text)?.trim() : null
    return text
      ? [{ kind: 'message', at: context.at, text, key: `${replyKey}:${index}:${text}` }]
      : []
  })
}

/** A slash command reads as what was typed ("/review 12"), not its XML wrapper. */
function promptText(text: string): string | null {
  const command = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1]
  if (command) {
    const args = /<command-args>([^<]*)<\/command-args>/.exec(text)?.[1]?.trim()
    return args ? `${command} ${args}` : command
  }
  if (text.startsWith('<local-command-') || text.startsWith('<bash-')) return null
  return text.trim() || null
}

function userSteps(entry: Record<string, unknown>, context: Context): TimelineStep[] {
  const content = asRecord(entry.message)?.content
  if (typeof content === 'string') {
    const text = entry.isMeta === true ? null : promptText(content)
    return text ? [{ kind: 'prompt', at: context.at, text }] : []
  }
  if (!Array.isArray(content)) return []
  const steps: TimelineStep[] = []
  const texts: string[] = []
  for (const item of content) {
    const block = asRecord(item)
    if (block?.type === 'tool_result') {
      const id = asString(block.tool_use_id)
      if (id) steps.push({ kind: 'result', id, isError: block.is_error === true })
    } else if (block?.type === 'text' && entry.isMeta !== true) {
      const text = promptText(asString(block.text) ?? '')
      if (text) texts.push(text)
    }
  }
  return texts.length > 0
    ? [...steps, { kind: 'prompt', at: context.at, text: texts.join('\n') }]
    : steps
}

/**
 * Timeline steps in Claude Code transcript lines (`~/.claude/projects/<cwd>/<session>.jsonl`):
 * the user's prompts, the assistant's text and tool calls (Agent calls are subagents), and tool
 * results. Subagents' own lines (sidechains) are left out: their call stands for them. Unknown
 * entry types, thinking blocks and malformed lines are skipped.
 */
export function readClaudeTimeline(lines: readonly string[]): TimelineStep[] {
  return lines.flatMap((line) => {
    const entry = parseLine(line)
    if (!entry || entry.isSidechain === true) return []
    const context = { at: asString(entry.timestamp) ?? '', cwd: asString(entry.cwd) }
    if (entry.type === 'assistant') return assistantSteps(entry, context)
    if (entry.type === 'user') return userSteps(entry, context)
    return []
  })
}
