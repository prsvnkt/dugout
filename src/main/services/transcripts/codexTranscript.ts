import {
  asRecord,
  asString,
  count,
  parseLine,
  type ContextReading,
  type TokenDetail,
  type TranscriptCarry,
  type TranscriptUsage,
  type UsageObservation,
} from './types'

/**
 * OpenAI counts cached (and cache-written) input inside `input_tokens`; Dugout keeps uncached
 * input apart, like Claude's. Reasoning is part of `output_tokens` already.
 */
function tokensOf(usage: Record<string, unknown>): TokenDetail {
  const cacheRead = count(usage.cached_input_tokens)
  const cacheWrite = count(usage.cache_write_input_tokens)
  return {
    input: Math.max(0, count(usage.input_tokens) - cacheRead - cacheWrite),
    output: count(usage.output_tokens),
    cacheRead,
    cacheWrite,
    cacheWriteLong: 0,
  }
}

interface TokenCount {
  readonly total: TokenDetail
  readonly at: string
  readonly context: ContextReading | null
}

function tokenCountOf(entry: Record<string, unknown>, model: string | null): TokenCount | null {
  const payload = asRecord(entry.payload)
  if (entry.type !== 'event_msg' || payload?.type !== 'token_count') return null
  const info = asRecord(payload.info)
  const total = asRecord(info?.total_token_usage)
  if (!info || !total) return null
  const last = asRecord(info.last_token_usage)
  const window = count(info.model_context_window)
  const context = last
    ? { tokens: count(last.input_tokens), window: window > 0 ? window : null, model }
    : null
  return { total: tokensOf(total), at: asString(entry.timestamp) ?? '', context }
}

/** The session id (from `session_meta`) and model (from `turn_context`), when a line names them. */
function nextCarry(entry: Record<string, unknown>, carry: TranscriptCarry): TranscriptCarry {
  const payload = asRecord(entry.payload)
  if (entry.type === 'session_meta') {
    const sessionKey = asString(payload?.id) ?? asString(payload?.session_id)
    return sessionKey ? { ...carry, sessionKey } : carry
  }
  if (entry.type === 'turn_context') {
    const model = asString(payload?.model)
    return model ? { ...carry, model } : carry
  }
  return carry
}

/**
 * Usage in Codex session logs (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`). Codex reports a
 * running total for the session with every `token_count` event, so only the last one in these
 * lines matters; it becomes one `cumulative` observation keyed by the session id (or
 * `fallbackKey`, the file, if the lines read so far never named it).
 */
export function readCodexTranscript(
  lines: readonly string[],
  carry: TranscriptCarry,
  fallbackKey: string,
): TranscriptUsage {
  let next = carry
  let latest: TokenCount | null = null
  for (const line of lines) {
    const entry = parseLine(line)
    if (!entry) continue
    next = nextCarry(entry, next)
    latest = tokenCountOf(entry, next.model ?? null) ?? latest
  }
  const observations: UsageObservation[] = latest
    ? [
        {
          kind: 'cumulative',
          key: next.sessionKey ?? fallbackKey,
          model: next.model ?? null,
          at: latest.at,
          tokens: latest.total,
        },
      ]
    : []
  return { observations, context: latest?.context ?? null, carry: next }
}
