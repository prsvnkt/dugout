import { describe, expect, test } from 'vitest'
import { EMPTY_TOTALS, type ProjectUsage } from '@shared/usage'
import {
  contextPercent,
  costLabel,
  formatCost,
  formatTokens,
  hasUsage,
  isContextNearlyFull,
  projectUsageLines,
  tokensLabel,
  usageBreakdown,
} from './usageFormat'

describe('usageFormat', () => {
  test('shortens token counts', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_345)).toBe('12.3k')
    expect(formatTokens(456_789)).toBe('457k')
    expect(formatTokens(1_234_567)).toBe('1.23M')
    expect(formatTokens(123_456_789)).toBe('123M')
  })

  test('shows cost in dollars, with tiny amounts as under a cent', () => {
    expect(formatCost(0)).toBe('$0')
    expect(formatCost(0.004)).toBe('<$0.01')
    expect(formatCost(12.345)).toBe('$12.35')
  })

  test('says how full the context is and warns from 80%', () => {
    expect(contextPercent({ tokens: 342_000, window: 1_000_000 })).toBe(34)
    expect(contextPercent({ tokens: 2_000_000, window: 1_000_000 })).toBe(100)
    expect(isContextNearlyFull({ tokens: 799, window: 1000 })).toBe(false)
    expect(isContextNearlyFull({ tokens: 800, window: 1000 })).toBe(true)
  })

  test('leaves cache reads out of the headline and says the cost is an estimate', () => {
    const totals = { ...EMPTY_TOTALS, input: 1000, output: 500, cacheRead: 90_000, costUsd: 0.5 }
    expect(tokensLabel(totals)).toBe('1.5k tokens')
    expect(costLabel(totals)).toBe('≈ $0.50 API-equivalent (estimate)')
    expect(usageBreakdown(totals)).toContain('Cache reads 90.0k (not in the token total)')
  })

  test('notes tokens of unpriced models', () => {
    expect(costLabel({ ...EMPTY_TOTALS, unpricedTokens: 2000 })).toContain('2.0k tokens unpriced')
  })

  test('sums a project up for its tab, lifetime and last 30 days', () => {
    const usage = {
      lifetime: { ...EMPTY_TOTALS, output: 1_500_000, costUsd: 30 },
      last30Days: { ...EMPTY_TOTALS, output: 200_000, costUsd: 4 },
    } as ProjectUsage
    expect(projectUsageLines(usage)).toEqual([
      'Tokens: 1.50M lifetime · 200k last 30 days',
      '≈ $30.00 lifetime · ≈ $4.00 last 30 days (API-equivalent estimate)',
    ])
    expect(projectUsageLines(undefined)).toEqual([])
  })

  test('has usage only when some tokens were counted', () => {
    expect(hasUsage(undefined)).toBe(false)
    expect(hasUsage(EMPTY_TOTALS)).toBe(false)
    expect(hasUsage({ ...EMPTY_TOTALS, cacheRead: 1 })).toBe(true)
  })
})
