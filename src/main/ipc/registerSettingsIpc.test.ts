import { afterEach, describe, expect, test, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc/channels'
import type { Settings, SettingsStore } from '../services/settings/SettingsStore'
import { FakeIpcMain, silenceIpcLogs } from './fakeIpcMain'
import { registerSettingsIpc } from './registerSettingsIpc'

function setup(saved: Partial<Settings>) {
  const settings = {
    load: vi.fn(async (): Promise<Partial<Settings>> => saved),
    update: vi.fn(async (change: Partial<Settings>): Promise<Partial<Settings>> => ({
      ...saved,
      ...change,
    })),
  }
  const ipc = new FakeIpcMain()
  registerSettingsIpc(settings as unknown as SettingsStore, ipc)
  return { ipc, settings }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registerSettingsIpc', () => {
  test('registers the settings channels', () => {
    // Arrange / Act
    const { ipc } = setup({})

    // Assert
    expect(ipc.channels()).toEqual([IpcChannel.settingsGet, IpcChannel.settingsUpdate].sort())
  })

  test('returns only app settings, never main-only ones like the clone folder', async () => {
    // Arrange
    const { ipc } = setup({ defaultAgent: 'codex', cloneParentDir: '/Users/me/code' })

    // Act
    const result = await ipc.invoke(IpcChannel.settingsGet)

    // Assert
    expect(result).toEqual({ ok: true, data: { defaultAgent: 'codex' } })
  })

  test('defaults the agent to Claude when none is saved', async () => {
    // Arrange
    const { ipc } = setup({})

    // Act
    const result = await ipc.invoke(IpcChannel.settingsGet)

    // Assert
    expect(result).toEqual({ ok: true, data: { defaultAgent: 'claude' } })
  })

  test('saves the change and returns the new app settings', async () => {
    // Arrange
    const { ipc, settings } = setup({ defaultAgent: 'claude' })

    // Act
    const result = await ipc.invoke(IpcChannel.settingsUpdate, { defaultAgent: 'opencode' })

    // Assert
    expect(settings.update).toHaveBeenCalledWith({ defaultAgent: 'opencode' })
    expect(result).toEqual({ ok: true, data: { defaultAgent: 'opencode' } })
  })

  test.each([{ defaultAgent: 'gpt' }, { cloneParentDir: '/tmp' }, undefined])(
    'rejects the invalid change %j',
    async (payload) => {
      // Arrange
      silenceIpcLogs()
      const { ipc, settings } = setup({})

      // Act
      const result = await ipc.invoke(IpcChannel.settingsUpdate, payload)

      // Assert
      expect(result).toEqual({ ok: false, error: 'Invalid request.' })
      expect(settings.update).not.toHaveBeenCalled()
    },
  )
})
