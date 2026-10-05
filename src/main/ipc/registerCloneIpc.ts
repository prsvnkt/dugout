import { existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { cloneRequestSchema } from '@shared/ipc/contract'
import type { GitService } from '../services/git/GitService'
import type { SettingsStore } from '../services/settings/SettingsStore'
import { handleRequest } from './handle'

/** ~/Developer when it exists (a common macOS convention), otherwise the home folder. */
function defaultParentDir(): string {
  const developer = join(homedir(), 'Developer')
  return existsSync(developer) ? developer : homedir()
}

export function registerCloneIpc(git: GitService, settings: SettingsStore): void {
  const running = new Map<number, AbortController>()

  handleRequest(IpcChannel.cloneDefaults, z.undefined(), async () => ({
    parentDir: (await settings.load()).cloneParentDir ?? defaultParentDir(),
  }))

  handleRequest(IpcChannel.cloneStart, cloneRequestSchema, async (request, event) => {
    const parent = await stat(request.parentDir).catch(() => null)
    if (!parent?.isDirectory()) throw new Error(`Folder does not exist: ${request.parentDir}`)
    if (running.has(event.sender.id)) throw new Error('A clone is already in progress.')

    const destination = join(request.parentDir, request.folderName)
    const controller = new AbortController()
    running.set(event.sender.id, controller)
    try {
      await git.clone(request.url, destination, {
        signal: controller.signal,
        onProgress: (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send(IpcChannel.cloneProgress, progress)
        },
      })
      await settings.update({ cloneParentDir: request.parentDir })
      return destination
    } finally {
      running.delete(event.sender.id)
    }
  })

  ipcMain.on(IpcChannel.cloneCancel, (event) => running.get(event.sender.id)?.abort())
}
