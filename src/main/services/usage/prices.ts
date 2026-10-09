import type { TokenDetail } from '../transcripts/types'

/**
 * API list prices in USD per million tokens, used only for an "API-equivalent cost (estimate)":
 * subscriptions do not pay per token. Checked against platform.claude.com/docs/en/about-claude/pricing
 * and developers.openai.com/api/docs/pricing on the date below. Standard tier, global routing,
 * short-context prices (Claude Haiku 5.5 up to 100K prompt tokens, OpenAI up to 272K); batch, fast
 * mode, data residency and long-context surcharges are not applied.
 * When a price changes, update the row and the date; usage already recorded keeps its cost.
 */
export const PRICES_AS_OF = '2026-10-09'

export interface ModelPrice {
  readonly input: number
  readonly output: number
  /** Cache reads (hits and refreshes). */
  readonly cacheRead: number
  /** 5-minute cache writes; OpenAI bills cache writes as input. */
  readonly cacheWrite: number
  /** 1-hour cache writes (Claude). */
  readonly cacheWriteLong: number
  /** Context window in tokens, for the "context used" share; omitted when the agent reports it. */
  readonly contextWindow?: number
}

const MILLION = 1_000_000
const CLAUDE_1M = 1_000_000
const CLAUDE_200K = 200_000

function claude(
  input: number,
  output: number,
  cacheRead: number,
  contextWindow: number,
): ModelPrice {
  return {
    input,
    output,
    cacheRead,
    cacheWrite: input * 1.25,
    cacheWriteLong: input * 2,
    contextWindow,
  }
}

function openai(input: number, cachedInput: number, output: number): ModelPrice {
  return { input, output, cacheRead: cachedInput, cacheWrite: input, cacheWriteLong: input }
}

/** By model id, without date suffixes or Claude Code's `[1m]` marker (see `normalizeModel`). */
export const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  'claude-fable-5-1': claude(10, 50, 0.25, CLAUDE_1M),
  'claude-mythos-5-1': claude(10, 50, 0.25, CLAUDE_1M),
  'claude-fable-5': claude(10, 50, 1, CLAUDE_1M),
  'claude-mythos-5': claude(10, 50, 1, CLAUDE_1M),
  'claude-opus-5-5': claude(4, 20, 0.2, CLAUDE_1M),
  'claude-opus-5': claude(5, 25, 0.5, CLAUDE_1M),
  'claude-opus-4-8': claude(5, 25, 0.5, CLAUDE_1M),
  'claude-opus-4-7': claude(5, 25, 0.5, CLAUDE_1M),
  'claude-opus-4-6': claude(5, 25, 0.5, CLAUDE_1M),
  'claude-opus-4-5': claude(5, 25, 0.5, CLAUDE_200K),
  'claude-sonnet-5-5': claude(2, 10, 0.1, CLAUDE_1M),
  'claude-sonnet-5': claude(2, 10, 0.2, CLAUDE_1M),
  'claude-sonnet-4-6': claude(3, 15, 0.3, CLAUDE_1M),
  'claude-sonnet-4-5': claude(3, 15, 0.3, CLAUDE_200K),
  'claude-haiku-5-5': claude(0.1, 0.5, 0.01, CLAUDE_1M),
  'claude-haiku-4-5': claude(1, 5, 0.1, CLAUDE_200K),
  'gpt-6-astra': openai(10, 1, 50),
  'gpt-6.1-sol': openai(2, 0.1, 10),
  'gpt-6-sol': openai(2, 0.2, 10),
  'gpt-6-luna': openai(0.1, 0.01, 0.5),
  'gpt-5.6-sol': openai(4, 0.4, 20),
  'gpt-5.6-terra': openai(2, 0.2, 12),
  'gpt-5.6-luna': openai(0.2, 0.02, 1.2),
  'gpt-5.5': openai(5, 0.5, 30),
  'gpt-5.4': openai(2.5, 0.25, 15),
  'gpt-5.4-mini': openai(0.75, 0.075, 4.5),
  'gpt-5.3-codex': openai(1.75, 0.175, 14),
  'gpt-5.2': openai(1.75, 0.175, 14),
  'gpt-5.1': openai(1.25, 0.125, 10),
  'gpt-5': openai(1.25, 0.125, 10),
  'gpt-5-mini': openai(0.25, 0.025, 2),
}

const ONE_MILLION_MARKER = /\[1m\]$/i
const DATE_SUFFIX = /-\d{8}$/

/** `claude-opus-4-5-20251101` → `claude-opus-4-5`; `claude-opus-5-5[1m]` → `claude-opus-5-5`. */
export function normalizeModel(model: string): string {
  return model.trim().toLowerCase().replace(ONE_MILLION_MARKER, '').replace(DATE_SUFFIX, '')
}

export function priceOf(model: string | null): ModelPrice | null {
  return model ? (MODEL_PRICES[normalizeModel(model)] ?? null) : null
}

/** The model's context window; `[1m]` models (Claude Code's 1M option) always have 1M. */
export function contextWindowOf(model: string | null): number | null {
  if (!model) return null
  if (ONE_MILLION_MARKER.test(model.trim())) return CLAUDE_1M
  return priceOf(model)?.contextWindow ?? null
}

/** API-equivalent cost in USD; null when the model has no price. */
export function costOf(model: string | null, tokens: TokenDetail): number | null {
  const price = priceOf(model)
  if (!price) return null
  const shortWrites = Math.max(0, tokens.cacheWrite - tokens.cacheWriteLong)
  const longWrites = Math.min(tokens.cacheWrite, tokens.cacheWriteLong)
  return (
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheRead * price.cacheRead +
      shortWrites * price.cacheWrite +
      longWrites * price.cacheWriteLong) /
    MILLION
  )
}
