import type { TokenCounts } from '@shared/usage'

/** Tokens of a model call, with the share of cache writes kept for an hour (priced higher). */
export interface TokenDetail extends TokenCounts {
  /** Part of `cacheWrite` written to the 1-hour cache. */
  readonly cacheWriteLong: number
}

/**
 * Usage found in a transcript. A `message` is one model reply, counted once by its id however
 * often it appears (streamed lines, forked sessions). A `cumulative` is a running total for a
 * whole session (Codex), which replaces the previous total for the same key.
 */
export type UsageObservation =
  | {
      readonly kind: 'message'
      readonly id: string
      readonly model: string
      /** ISO timestamp of the reply; empty when the line had none. */
      readonly at: string
      readonly tokens: TokenDetail
    }
  | {
      readonly kind: 'cumulative'
      readonly key: string
      readonly model: string | null
      readonly at: string
      readonly tokens: TokenDetail
    }

/** The latest call's prompt size: how full the context window is. */
export interface ContextReading {
  readonly tokens: number
  /** The model's window when the transcript says it; otherwise looked up by model. */
  readonly window: number | null
  readonly model: string | null
}

/** What a format remembers between reads of one file (e.g. the model, named once at the top). */
export interface TranscriptCarry {
  readonly sessionKey?: string
  readonly model?: string
}

export interface TranscriptUsage {
  readonly observations: readonly UsageObservation[]
  /** From the last main-conversation call in these lines; null when there was none. */
  readonly context: ContextReading | null
  readonly carry: TranscriptCarry
}

export const NO_TOKENS: TokenDetail = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cacheWriteLong: 0,
}

/** A token count from untrusted JSON: a non-negative integer, else 0. */
export function count(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0
}

export function isEmpty(tokens: TokenDetail): boolean {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite === 0
}

/** Parses one JSONL line into an object; null for blank, malformed or non-object lines. */
export function parseLine(line: string): Record<string, unknown> | null {
  if (!line.trim()) return null
  try {
    const value: unknown = JSON.parse(line)
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}
