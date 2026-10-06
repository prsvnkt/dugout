import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { TokenStore, type Encryption } from './TokenStore'

const reversing: Encryption = {
  isAvailable: () => true,
  encrypt: (text) => Buffer.from([...text].reverse().join('')),
  decrypt: (data) => [...data.toString()].reverse().join(''),
}

const CREDENTIALS = {
  accessToken: 'ghu_secret',
  refreshToken: 'ghr_secret',
  accessTokenExpiresAt: 1_000,
  refreshTokenExpiresAt: 2_000,
}

function setup(encryption: Encryption = reversing) {
  const filePath = join(mkdtempSync(join(tmpdir(), 'dugout-token-')), 'github-token.bin')
  return { store: new TokenStore({ filePath, encryption }), filePath }
}

describe('TokenStore', () => {
  test('stores the credentials encrypted and only readable by the user', async () => {
    const { store, filePath } = setup()
    await store.save(CREDENTIALS)

    const raw = readFileSync(filePath, 'utf8')
    expect(raw).not.toContain('ghu_secret')
    expect(raw).not.toContain('ghr_secret')
    expect(statSync(filePath).mode & 0o777).toBe(0o600)
    expect(await store.load()).toEqual(CREDENTIALS)
  })

  test('reads a token saved by earlier versions (plain token, never expires)', async () => {
    const { store, filePath } = setup()
    writeFileSync(filePath, reversing.encrypt('gho_legacy'))
    expect(await store.load()).toEqual({
      accessToken: 'gho_legacy',
      refreshToken: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
    })
  })

  test('has no credentials until saved, and forgets them on clear', async () => {
    const { store, filePath } = setup()
    expect(await store.load()).toBeNull()
    await store.save(CREDENTIALS)
    await store.clear()
    expect(existsSync(filePath)).toBe(false)
    expect(await store.load()).toBeNull()
  })

  test('refuses to store credentials without secure storage', async () => {
    const { store } = setup({ ...reversing, isAvailable: () => false })
    await expect(store.save(CREDENTIALS)).rejects.toThrow('Secure storage')
  })
})

describe('TokenStore account details', () => {
  test('keeps the account (not secret) with the credentials, for offline display', async () => {
    const { store } = setup()
    const account = { login: 'octo', name: 'Octo', avatarUrl: 'https://a/1.png' }
    await store.save({ ...CREDENTIALS, account })
    expect(await store.load()).toEqual({ ...CREDENTIALS, account })
  })
})
