import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { hookHeaderIssuer } from './hookHeaderFiles'
import { HookTokens } from './hookTokens'

const newDir = () => join(mkdtempSync(join(tmpdir(), 'dugout-headers-')), 'hook-headers')

describe('hookHeaderIssuer', () => {
  test("writes each terminal's Authorization header to its own owner-only file", () => {
    // Arrange
    const tokens = new HookTokens()
    const issuer = hookHeaderIssuer(tokens, newDir())

    // Act
    const { token, headerFile } = issuer.issue('t-1')

    // Assert
    const header = readFileSync(headerFile, 'utf8').trim()
    expect(header).toBe(`Authorization: Bearer ${token}`)
    expect(tokens.isAuthorized('t-1', header.slice('Authorization: '.length))).toBe(true)
    expect(statSync(headerFile).mode & 0o777).toBe(0o600)
    expect(statSync(join(headerFile, '..')).mode & 0o777).toBe(0o700)
  })

  test('removes the file and forgets the token when the terminal exits', () => {
    const tokens = new HookTokens()
    const issuer = hookHeaderIssuer(tokens, newDir())
    const { token, headerFile } = issuer.issue('t-1')

    issuer.revoke('t-1')

    expect(existsSync(headerFile)).toBe(false)
    expect(tokens.isAuthorized('t-1', `Bearer ${token}`)).toBe(false)
  })

  test('clears header files left by an earlier run', () => {
    const dir = newDir()
    hookHeaderIssuer(new HookTokens(), dir).issue('stale')
    writeFileSync(join(dir, 'other'), 'x')

    hookHeaderIssuer(new HookTokens(), dir)

    expect(existsSync(join(dir, 'stale'))).toBe(false)
    expect(existsSync(join(dir, 'other'))).toBe(false)
  })
})
