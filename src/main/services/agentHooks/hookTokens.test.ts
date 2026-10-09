import { describe, expect, test } from 'vitest'
import { HookTokens } from './hookTokens'

describe('HookTokens', () => {
  test('a terminal is authorized with its own token', () => {
    // Arrange
    const tokens = new HookTokens()
    const token = tokens.issue('a')

    // Act / Assert
    expect(tokens.isAuthorized('a', `Bearer ${token}`)).toBe(true)
  })

  test('every terminal gets a different random token', () => {
    const tokens = new HookTokens()
    const first = tokens.issue('a')
    const second = tokens.issue('b')
    expect(first).not.toBe(second)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
  })

  test("one terminal's token does not authorize another terminal", () => {
    const tokens = new HookTokens()
    const tokenA = tokens.issue('a')
    tokens.issue('b')
    expect(tokens.isAuthorized('b', `Bearer ${tokenA}`)).toBe(false)
  })

  test('rejects missing, malformed and unknown credentials', () => {
    const tokens = new HookTokens()
    const token = tokens.issue('a')
    expect(tokens.isAuthorized('a', undefined)).toBe(false)
    expect(tokens.isAuthorized('a', token)).toBe(false)
    expect(tokens.isAuthorized('a', `Bearer ${token}x`)).toBe(false)
    expect(tokens.isAuthorized('never-issued', `Bearer ${token}`)).toBe(false)
  })

  test('a revoked token no longer works, and issuing again replaces it', () => {
    const tokens = new HookTokens()
    const old = tokens.issue('a')
    tokens.revoke('a')
    expect(tokens.isAuthorized('a', `Bearer ${old}`)).toBe(false)
    const fresh = tokens.issue('a')
    expect(tokens.isAuthorized('a', `Bearer ${fresh}`)).toBe(true)
    expect(tokens.isAuthorized('a', `Bearer ${old}`)).toBe(false)
  })
})
