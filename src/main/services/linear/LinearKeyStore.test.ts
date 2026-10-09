import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import type { Encryption } from '../github/TokenStore'
import { LinearKeyStore } from './LinearKeyStore'

const reversing: Encryption = {
  isAvailable: () => true,
  encrypt: (text) => Buffer.from([...text].reverse().join('')),
  decrypt: (data) => [...data.toString()].reverse().join(''),
}

const STORED = { apiKey: 'lin_api_secret', account: { name: 'Ada', organization: 'Acme' } }

function setup(encryption: Encryption = reversing) {
  const filePath = join(mkdtempSync(join(tmpdir(), 'dugout-linear-')), 'linear-key.bin')
  return { store: new LinearKeyStore({ filePath, encryption }), filePath }
}

describe('LinearKeyStore', () => {
  test('stores the key encrypted and only readable by the user', async () => {
    const { store, filePath } = setup()

    await store.save(STORED)

    expect(readFileSync(filePath, 'utf8')).not.toContain('lin_api_secret')
    expect(statSync(filePath).mode & 0o777).toBe(0o600)
    expect(await store.load()).toEqual(STORED)
  })

  test('nothing saved yet reads as null', async () => {
    expect(await setup().store.load()).toBeNull()
  })

  test('forgets a file it cannot read', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { store, filePath } = setup()
    writeFileSync(filePath, reversing.encrypt('{"apiKey": 3}'))

    expect(await store.load()).toBeNull()
    expect(existsSync(filePath)).toBe(false)
    warn.mockRestore()
  })

  test('refuses to save without secure storage, and clears', async () => {
    const { store, filePath } = setup({ ...reversing, isAvailable: () => false })
    await expect(store.save(STORED)).rejects.toThrow('Secure storage is not available')

    writeFileSync(filePath, 'x')
    await store.clear()
    expect(existsSync(filePath)).toBe(false)
  })
})
