import type { TouchedFile } from '@shared/timeline'
import { displayPath, oneLine, patchedFiles, type TimelineStep } from './timelineSteps'
import { asRecord, asString, parseLine } from './types'

const SUBAGENT_TOOLS = new Set(['spawn_agent'])
/** Arguments that best say what a call did, in order of preference. */
const DETAIL_FIELDS = [
  'command',
  'cmd',
  'path',
  'file_path',
  'pattern',
  'query',
  'url',
  'task_name',
]
/** "exit_code": 1, "Exit code: 1", "exited with code 1": a non-zero code is a failure. */
const EXIT_CODE = /exit(?:ed with)?[_ ]code"?\s*[:=]?\s*(-?\d+)/i

interface Context {
  readonly at: string
  readonly cwd: string | null
}

/** Text of an output or message: a string, or a list of `{ text }` items. */
function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  return value
    .map((item) => asString(asRecord(item)?.text) ?? '')
    .filter(Boolean)
    .join('\n')
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (typeof value !== 'string') return asRecord(value) ?? {}
  try {
    return asRecord(JSON.parse(value)) ?? {}
  } catch {
    return {}
  }
}

function detailOf(args: Record<string, unknown>, rawInput: string, cwd: string | null) {
  const command = args.command ?? args.cmd
  if (Array.isArray(command)) return oneLine(command.filter((p) => typeof p === 'string').join(' '))
  const field = DETAIL_FIELDS.find((key) => asString(args[key]))
  const value = field ? asString(args[field]) : null
  if (value)
    return oneLine(field === 'path' || field === 'file_path' ? displayPath(value, cwd) : value)
  // Free-form input (e.g. a script) is described by its first line; JSON without a known field
  // says nothing useful.
  if (rawInput.trim().startsWith('{')) return null
  const firstLine = rawInput.split('\n').find((line) => line.trim())
  return firstLine ? oneLine(firstLine) : null
}

function filesOf(text: string, cwd: string | null): TouchedFile[] {
  return patchedFiles(text).map((path) => ({ path: displayPath(path, cwd), change: 'edited' }))
}

/** A function call, custom tool call (e.g. `apply_patch`, `exec`) or local shell call. */
function callOf(payload: Record<string, unknown>, { at, cwd }: Context): TimelineStep | null {
  const id = asString(payload.call_id) ?? asString(payload.id)
  const isShell = payload.type === 'local_shell_call'
  const name = isShell ? 'shell' : asString(payload.name)
  if (!id || !name) return null
  const raw = isShell ? payload.action : (payload.arguments ?? payload.input)
  const args = parseArguments(raw)
  const rawInput = typeof raw === 'string' ? raw : ''
  const files = filesOf([rawInput, asString(args.input) ?? ''].join('\n'), cwd)
  // A patch is best described by the files it changes.
  const detail = files.length > 0 ? oneLine(files.map((file) => file.path).join(', ')) : null
  return {
    kind: 'call',
    at,
    id,
    name,
    detail: detail ?? detailOf(args, rawInput, cwd),
    subagent: SUBAGENT_TOOLS.has(name) ? { agentType: asString(args.agent_type) } : null,
    files,
  }
}

function resultOf(payload: Record<string, unknown>): TimelineStep | null {
  const id = asString(payload.call_id)
  if (!id) return null
  const output = textOf(payload.output)
  const exitCode = EXIT_CODE.exec(output)?.[1]
  const isError =
    payload.status === 'failed' ||
    /"success"\s*:\s*false/.test(output) ||
    (exitCode !== undefined && Number(exitCode) !== 0)
  return { kind: 'result', id, isError }
}

function responseStep(payload: Record<string, unknown>, context: Context): TimelineStep | null {
  switch (payload.type) {
    case 'message': {
      const text = payload.role === 'assistant' ? textOf(payload.content).trim() : ''
      const key = asString(payload.id) ?? `${context.at}:${text}`
      return text ? { kind: 'message', at: context.at, text, key } : null
    }
    case 'function_call':
    case 'custom_tool_call':
    case 'local_shell_call':
      return callOf(payload, context)
    case 'function_call_output':
    case 'custom_tool_call_output':
      return resultOf(payload)
    default:
      return null
  }
}

/**
 * The user's prompt: `user_message` events in older logs, `item_completed` UserMessage items in
 * newer ones. Response-item user messages also carry injected context, so they are not used.
 */
function eventStep(payload: Record<string, unknown>, context: Context): TimelineStep | null {
  if (payload.type === 'user_message') {
    const text = asString(payload.message)?.trim()
    return text ? { kind: 'prompt', at: context.at, text } : null
  }
  const item = asRecord(payload.item)
  if (payload.type === 'item_completed' && item?.type === 'UserMessage') {
    const text = textOf(item.content).trim()
    return text ? { kind: 'prompt', at: context.at, text } : null
  }
  if (payload.type === 'task_complete') {
    const text = asString(payload.last_agent_message)?.trim()
    return text ? { kind: 'final', text } : null
  }
  return null
}

function isRepeatedPrompt(step: TimelineStep, previous: TimelineStep | undefined): boolean {
  return step.kind === 'prompt' && previous?.kind === 'prompt' && previous.text === step.text
}

/**
 * Timeline steps in Codex session logs (`~/.codex/sessions/…/rollout-*.jsonl`): prompts,
 * assistant messages, function and custom tool calls with their outputs (a non-zero exit code is
 * a failure), `apply_patch` files and `spawn_agent` subagents. The folder comes from
 * `session_meta`/`turn_context`. Unknown entry types and malformed lines are skipped.
 */
export function readCodexTimeline(lines: readonly string[]): TimelineStep[] {
  const steps: TimelineStep[] = []
  let cwd: string | null = null
  for (const line of lines) {
    const entry = parseLine(line)
    const payload = asRecord(entry?.payload)
    if (!entry || !payload) continue
    if (entry.type === 'session_meta' || entry.type === 'turn_context') {
      cwd = asString(payload.cwd) ?? cwd
      continue
    }
    const context = { at: asString(entry.timestamp) ?? '', cwd }
    const step =
      entry.type === 'response_item'
        ? responseStep(payload, context)
        : entry.type === 'event_msg'
          ? eventStep(payload, context)
          : null
    if (step && !isRepeatedPrompt(step, steps.at(-1))) steps.push(step)
  }
  return steps
}
