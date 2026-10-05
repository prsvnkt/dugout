import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { TokenStore, type Encryption } from './TokenStore'

const reversing: Encryption = {
  isAvailable: () => true,
  encrypt: (text) => Buffer.from([...text].reverse().join('')),
  decrypt: (data) => [...data.toString()].reverse().join(''),
}

function setup(encryption: Encryption = reversing) {
  const filePath = join(mkdtempSync(join(tmpdir(), 'dugout-token-')), 'github-token.bin')
  return { store: new TokenStore({ filePath, encryption }), filePath }
}

describe('TokenStore', () => {
  test('stores the token encrypted and only readable by the user', async () => {
    const { store, filePath } = setup()
    await store.save('gho_secret')

    expect(readFileSync(filePath, 'utf8')).not.toContain('gho_secret')
    expect(statSync(filePath).mode & 0o777).toBe(0o600)
    expect(await store.load()).toBe('gho_secret')
  })

  test('has no token until one is saved, and forgets it on clear', async () => {
    const { store, filePath } = setup()
    expect(await store.load()).toBeNull()
    await store.save('gho_secret')
    await store.clear()
    expect(existsSync(filePath)).toBe(false)
    expect(await store.load()).toBeNull()
  })

  test('refuses to store a token without secure storage', async () => {
    const { store } = setup({ ...reversing, isAvailable: () => false })
    await expect(store.save('gho_secret')).rejects.toThrow('Secure storage')
  })
})
