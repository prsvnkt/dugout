import { stat } from 'node:fs/promises'
import { ipcMain, type WebContents } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'
import {
  terminalCreateRequestSchema,
  terminalKillRequestSchema,
  terminalResizeRequestSchema,
  terminalWriteRequestSchema,
} from '@shared/ipc/contract'
import type { TerminalId } from '@shared/terminal'
import type { TerminalManager } from '../services/terminal/TerminalManager'
import { parsePayload } from './validate'

async function assertDirectory(path: string): Promise<void> {
  const stats = await stat(path).catch(() => null)
  if (!stats?.isDirectory()) throw new Error(`Folder does not exist: ${path}`)
}

function sendTo(contents: WebContents, channel: string, ...args: unknown[]): void {
  if (!contents.isDestroyed()) contents.send(channel, ...args)
}

/**
 * Terminals belong to the renderer that created them. When that renderer reloads or
 * closes, its terminals are killed so no orphaned agents keep running unseen.
 */
function trackOwnership(manager: TerminalManager) {
  const owned = new Map<WebContents, Set<TerminalId>>()

  const release = (contents: WebContents) => {
    for (const id of owned.get(contents) ?? []) manager.kill(id)
    owned.delete(contents)
  }

  return {
    add(contents: WebContents, id: TerminalId) {
      if (!owned.has(contents)) {
        owned.set(contents, new Set())
        contents.once('destroyed', () => release(contents))
        contents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
          if (isMainFrame && !isSameDocument) release(contents)
        })
      }
      owned.get(contents)?.add(id)
    },
    remove(contents: WebContents, id: TerminalId) {
      owned.get(contents)?.delete(id)
    },
  }
}

export function registerTerminalIpc(manager: TerminalManager): void {
  const ownership = trackOwnership(manager)

  ipcMain.handle(IpcChannel.terminalCreate, async (event, payload: unknown) => {
    const request = parsePayload(terminalCreateRequestSchema, payload, IpcChannel.terminalCreate)
    if (!request) throw new Error('Invalid terminal request')
    await assertDirectory(request.cwd)

    const owner = event.sender
    const id = manager.create(request, {
      onData: (terminalId, data) => sendTo(owner, IpcChannel.terminalData, terminalId, data),
      onExit: (terminalId, exit) => {
        ownership.remove(owner, terminalId)
        sendTo(owner, IpcChannel.terminalExit, terminalId, exit)
      },
    })
    ownership.add(owner, id)
    return id
  })

  ipcMain.on(IpcChannel.terminalWrite, (_event, payload: unknown) => {
    const request = parsePayload(terminalWriteRequestSchema, payload, IpcChannel.terminalWrite)
    if (request) manager.write(request.id, request.data)
  })

  ipcMain.on(IpcChannel.terminalResize, (_event, payload: unknown) => {
    const request = parsePayload(terminalResizeRequestSchema, payload, IpcChannel.terminalResize)
    if (request) manager.resize(request.id, request.cols, request.rows)
  })

  ipcMain.on(IpcChannel.terminalKill, (_event, payload: unknown) => {
    const request = parsePayload(terminalKillRequestSchema, payload, IpcChannel.terminalKill)
    if (request) manager.kill(request.id)
  })
}
