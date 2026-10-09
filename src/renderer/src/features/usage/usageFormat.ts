import {
  CONTEXT_WARNING_SHARE,
  headlineTokens,
  type ContextUsage,
  type ProjectUsage,
  type UsageTotals,
} from '@shared/usage'

const THOUSAND = 1_000
const MILLION = 1_000_000
const MIN_SHOWN_COST = 0.01

/** 950 → "950", 12_345 → "12.3k", 1_234_567 → "1.23M". */
export function formatTokens(count: number): string {
  if (count < THOUSAND) return String(count)
  if (count < MILLION) {
    const thousands = count / THOUSAND
    return `${thousands < 100 ? thousands.toFixed(1) : Math.round(thousands)}k`
  }
  const millions = count / MILLION
  return `${millions < 100 ? millions.toFixed(2) : Math.round(millions)}M`
}

/** "$1.23", "<$0.01" or "$0". */
export function formatCost(usd: number): string {
  if (usd === 0) return '$0'
  if (usd < MIN_SHOWN_COST) return '<$0.01'
  return `$${usd.toFixed(2)}`
}

/** Share of the context window used, 0–100. */
export function contextPercent(context: ContextUsage): number {
  return Math.min(100, Math.round((context.tokens / context.window) * 100))
}

export function isContextNearlyFull(context: ContextUsage): boolean {
  return context.tokens / context.window >= CONTEXT_WARNING_SHARE
}

/** "12.3k tokens", the headline: input, output and cache writes (cache reads apart). */
export function tokensLabel(totals: UsageTotals): string {
  return `${formatTokens(headlineTokens(totals))} tokens`
}

/** "≈ $1.23 API-equivalent (estimate)", noting tokens of models without a price. */
export function costLabel(totals: UsageTotals): string {
  const unpriced =
    totals.unpricedTokens > 0 ? `, ${formatTokens(totals.unpricedTokens)} tokens unpriced` : ''
  return `≈ ${formatCost(totals.costUsd)} API-equivalent (estimate${unpriced})`
}

/** Multi-line tooltip text: the token kinds, then the cost estimate. */
export function usageBreakdown(totals: UsageTotals): string {
  return [
    `Input ${formatTokens(totals.input)} · output ${formatTokens(totals.output)} · cache writes ${formatTokens(totals.cacheWrite)}`,
    `Cache reads ${formatTokens(totals.cacheRead)} (not in the token total)`,
    costLabel(totals),
  ].join('\n')
}

/** A project tab's tooltip lines: lifetime and last-30-days totals; empty without usage. */
export function projectUsageLines(usage: ProjectUsage | undefined): string[] {
  if (!hasUsage(usage?.lifetime) || !usage) return []
  const { lifetime, last30Days } = usage
  return [
    `Tokens: ${formatTokens(headlineTokens(lifetime))} lifetime · ${formatTokens(headlineTokens(last30Days))} last 30 days`,
    `≈ ${formatCost(lifetime.costUsd)} lifetime · ≈ ${formatCost(last30Days.costUsd)} last 30 days (API-equivalent estimate)`,
  ]
}

export function hasUsage(totals: UsageTotals | undefined): totals is UsageTotals {
  return totals !== undefined && headlineTokens(totals) + totals.cacheRead > 0
}
