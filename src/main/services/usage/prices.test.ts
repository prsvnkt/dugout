import { describe, expect, test } from 'vitest'
import { NO_TOKENS } from '../transcripts/types'
import { contextWindowOf, costOf, normalizeModel, priceOf } from './prices'

describe('prices', () => {
  test('finds a model by id without its date suffix or 1M marker', () => {
    expect(normalizeModel('claude-opus-4-5-20251101')).toBe('claude-opus-4-5')
    expect(normalizeModel('claude-opus-5-5[1m]')).toBe('claude-opus-5-5')
    expect(priceOf('claude-opus-5-5[1m]')).toBe(priceOf('claude-opus-5-5'))
  })

  test('has no price for an unknown model', () => {
    expect(priceOf('claude-opus-9')).toBeNull()
    expect(costOf('claude-opus-9', { ...NO_TOKENS, input: 1000 })).toBeNull()
  })

  test('prices input, output, cache reads and both cache write durations', () => {
    // Claude Opus 5.5: $4 in, $20 out, $0.20 cache reads, $5 5-minute and $8 1-hour writes.
    const cost = costOf('claude-opus-5-5', {
      input: 1_000_000,
      output: 1_000_000,
      cacheRead: 1_000_000,
      cacheWrite: 2_000_000,
      cacheWriteLong: 1_000_000,
    })
    expect(cost).toBeCloseTo(4 + 20 + 0.2 + 5 + 8)
  })

  test('prices OpenAI cached input at the cached rate', () => {
    const cost = costOf('gpt-6-astra', { ...NO_TOKENS, input: 1_000_000, cacheRead: 1_000_000 })
    expect(cost).toBeCloseTo(10 + 1)
  })

  test('knows Claude context windows, and 1M for [1m] models', () => {
    expect(contextWindowOf('claude-haiku-4-5')).toBe(200_000)
    expect(contextWindowOf('claude-sonnet-4-5[1m]')).toBe(1_000_000)
    expect(contextWindowOf('gpt-6-astra')).toBeNull()
    expect(contextWindowOf(null)).toBeNull()
  })
})
