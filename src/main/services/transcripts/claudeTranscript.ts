import {
  asRecord,
  asString,
  count,
  isEmpty,
  parseLine,
  type ContextReading,
  type TokenDetail,
  type TranscriptUsage,
  type UsageObservation,
} from './types'

/** Claude Code marks replies it made up itself (e.g. API errors) with this model; they cost nothing. */
const SYNTHETIC_MODEL = '<synthetic>'

function tokensOf(usage: Record<string, unknown>): TokenDetail {
  const creation = asRecord(usage.cache_creation)
  return {
    input: count(usage.input_tokens),
    output: count(usage.output_tokens),
    cacheRead: count(usage.cache_read_input_tokens),
    cacheWrite: count(usage.cache_creation_input_tokens),
    cacheWriteLong: count(creation?.ephemeral_1h_input_tokens),
  }
}

interface ClaudeReply {
  readonly observation: Extract<UsageObservation, { kind: 'message' }>
  readonly isSidechain: boolean
}

/** An assistant line with usage; null for every other entry type or a malformed line. */
function replyOf(line: string): ClaudeReply | null {
  const entry = parseLine(line)
  if (entry?.type !== 'assistant') return null
  const message = asRecord(entry.message)
  const id = asString(message?.id)
  const model = asString(message?.model)
  const usage = asRecord(message?.usage)
  if (!id || !model || !usage || model === SYNTHETIC_MODEL) return null
  const tokens = tokensOf(usage)
  if (isEmpty(tokens)) return null
  return {
    observation: { kind: 'message', id, model, at: asString(entry.timestamp) ?? '', tokens },
    isSidechain: entry.isSidechain === true,
  }
}

/**
 * Usage in Claude Code transcript lines (`~/.claude/projects/<cwd>/<session>.jsonl`, and the
 * session's `subagents/agent-*.jsonl`). Each reply is one `message` observation; a reply streamed
 * over several lines repeats its id and usage, so only its first line counts. Subagent replies
 * (sidechains) count too, but only the main conversation says how full the context is.
 */
export function readClaudeTranscript(lines: readonly string[]): TranscriptUsage {
  const seen = new Set<string>()
  const observations: UsageObservation[] = []
  let context: ContextReading | null = null
  for (const line of lines) {
    const reply = replyOf(line)
    if (!reply) continue
    const { observation, isSidechain } = reply
    if (!isSidechain) {
      const { input, cacheRead, cacheWrite } = observation.tokens
      context = { tokens: input + cacheRead + cacheWrite, window: null, model: observation.model }
    }
    if (seen.has(observation.id)) continue
    seen.add(observation.id)
    observations.push(observation)
  }
  return { observations, context, carry: {} }
}
