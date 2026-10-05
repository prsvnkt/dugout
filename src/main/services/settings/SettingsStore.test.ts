import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { SettingsStore } from './SettingsStore'

function setup(dir = mkdtempSync(join(tmpdir(), 'dugout-settings-'))) {
  return { store: new SettingsStore({ filePath: join(dir, 'settings.json') }), dir }
}

describe('SettingsStore', () => {
  test('starts with defaults', async () => {
    expect(await setup().store.load()).toEqual({ version: 1 })
  })

  test('saves updates without losing other settings', async () => {
    const { store, dir } = setup()
    await store.update({ cloneParentDir: '/Users/me/code' })
    expect(await setup(dir).store.load()).toEqual({ version: 1, cloneParentDir: '/Users/me/code' })
  })

  test('falls back to defaults for an invalid file', async () => {
    const { store, dir } = setup()
    writeFileSync(join(dir, 'settings.json'), '{"version": 99}')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await store.load()).toEqual({ version: 1 })
    warn.mockRestore()
  })
})
