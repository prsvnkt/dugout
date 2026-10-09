import type { AgentKind } from './agents'

/**
 * Tokens of one or more model calls. `input` is uncached input only; cache reads and writes are
 * counted apart, so cheap cache reads never swamp the totals.
 */
export interface TokenCounts {
  readonly input: number
  readonly output: number
  readonly cacheRead: number
  readonly cacheWrite: number
}

/** Tokens plus their API-equivalent cost, an estimate (subscriptions do not pay per token). */
export interface UsageTotals extends TokenCounts {
  readonly costUsd: number
  /** Tokens of models missing from the price table, so not in `costUsd`. */
  readonly unpricedTokens: number
}

export const EMPTY_TOTALS: UsageTotals = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  costUsd: 0,
  unpricedTokens: 0,
}

export function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    costUsd: a.costUsd + b.costUsd,
    unpricedTokens: a.unpricedTokens + b.unpricedTokens,
  }
}

/** The headline number: input, output and cache writes. Cache reads are shown on their own. */
export function headlineTokens(counts: TokenCounts): number {
  return counts.input + counts.output + counts.cacheWrite
}

/** How full the agent's context window is, from its latest model call. */
export interface ContextUsage {
  readonly tokens: number
  readonly window: number
}

/** One agent session's usage, live in its terminal header. */
export interface AgentUsage {
  readonly sessionId: string
  readonly totals: UsageTotals
  readonly model: string | null
  /** Null until a call reports it, or when the model's window is unknown. */
  readonly context: ContextUsage | null
}

export interface TaskUsage {
  readonly task: number
  readonly totals: UsageTotals
  readonly byAgent: Readonly<Partial<Record<AgentKind, UsageTotals>>>
}

export interface UsageDay {
  /** Local date, `YYYY-MM-DD`. */
  readonly day: string
  readonly totals: UsageTotals
  readonly byAgent: Readonly<Partial<Record<AgentKind, UsageTotals>>>
}

/** A project's usage as Dugout recorded it (its own ledger, so it outlives the transcripts). */
export interface ProjectUsage {
  readonly lifetime: UsageTotals
  readonly last30Days: UsageTotals
  readonly byAgent: Readonly<Partial<Record<AgentKind, UsageTotals>>>
  readonly byModel: readonly { readonly model: string; readonly totals: UsageTotals }[]
  /** Every task with usage, newest task first, with each agent's share (e.g. for Compare). */
  readonly byTask: readonly TaskUsage[]
  /** The last 30 days that had usage, newest first. */
  readonly days: readonly UsageDay[]
  /** When the price table behind `costUsd` was last checked, `YYYY-MM-DD`. */
  readonly pricesAsOf: string
}

/** Context windows at or above this share are flagged: the agent may compact soon. */
export const CONTEXT_WARNING_SHARE = 0.8
