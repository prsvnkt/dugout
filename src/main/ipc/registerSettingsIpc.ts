import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { settingsUpdateRequestSchema } from '@shared/ipc/contract'
import { DEFAULT_AGENT, type AppSettings } from '@shared/settings'
import type { Settings, SettingsStore } from '../services/settings/SettingsStore'
import { handleRequest } from './handle'

function toAppSettings(settings: Settings): AppSettings {
  return { defaultAgent: settings.defaultAgent ?? DEFAULT_AGENT }
}

export function registerSettingsIpc(settings: SettingsStore): void {
  handleRequest(IpcChannel.settingsGet, z.undefined(), async () =>
    toAppSettings(await settings.load()),
  )
  handleRequest(IpcChannel.settingsUpdate, settingsUpdateRequestSchema, async (change) =>
    toAppSettings(await settings.update(change)),
  )
}
