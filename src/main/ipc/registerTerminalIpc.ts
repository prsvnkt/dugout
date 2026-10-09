import { stat } from 'node:fs/promises'
import { ipcMain, type WebContents } from 'electron'
import { IpcChannel } from '@shared/ipc/channels'
import {
  terminalCreateRequestSchema,
  terminalFlowRequestSchema,
  terminalKillRequestSchema,
  terminalResizeRequestSchema,
  terminalWithheldServersRequestSchema,
  terminalWriteRequestSchema,
} from '@shared/ipc/contract'
import { isAgentKind, type TerminalId } from '@shared/terminal'
import type { CheckRunner } from '../services/checks/CheckRunner'
import type {
  TerminalEvents,
  TerminalManager,
  TerminalSetup,
} from '../services/terminal/TerminalManager'
import { handleRequest } from './handle'
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

/** Hands out new worktrees' setup commands (`WorktreeManager`). */
export interface TerminalSetups {
  claimSetup(cwd: string): TerminalSetup | null
}

/**
 * `checks` runs Verify on Stop for agents that report status (decision 042); `setups`
 * gives the first agent in a new worktree its setup command (decision 038).
 */
export function registerTerminalIpc(
  manager: TerminalManager,
  checks: CheckRunner,
  setups: TerminalSetups,
): void {
  const ownership = trackOwnership(manager)

  handleRequest(IpcChannel.terminalCreate, terminalCreateRequestSchema, async (request, event) => {
    await assertDirectory(request.cwd)

    const owner = event.sender
    // The first agent in a new worktree runs its setup first; shells never do.
    const setup = isAgentKind(request.kind) ? setups.claimSetup(request.cwd) : null
    const events: TerminalEvents = {
      onData: (terminalId, data) => sendTo(owner, IpcChannel.terminalData, terminalId, data),
      onExit: (terminalId, exit) => {
        ownership.remove(owner, terminalId)
        checks.untrack(terminalId)
        sendTo(owner, IpcChannel.terminalExit, terminalId, exit)
      },
      onAgentStatus: (terminalId, status, detail, approvals) => {
        sendTo(owner, IpcChannel.terminalAgentStatus, terminalId, status, detail, approvals)
        checks.agentStatus(terminalId, status)
      },
      onAgentSession: (terminalId, sessionId) =>
        sendTo(owner, IpcChannel.terminalAgentSession, terminalId, sessionId),
      onAgentSubagent: (terminalId, update) =>
        sendTo(owner, IpcChannel.terminalAgentSubagent, terminalId, update),
      onAgentUsage: (terminalId, usage) =>
        sendTo(owner, IpcChannel.terminalAgentUsage, terminalId, usage),
    }
    let id: TerminalId
    try {
      id = manager.create(request, events, setup ?? undefined)
    } catch (error) {
      setup?.finish(false) // Keep it for the next agent, as the setup never ran.
      throw error
    }
    ownership.add(owner, id)
    checks.track(id, { projectId: request.projectId, cwd: request.cwd }, (status) =>
      sendTo(owner, IpcChannel.terminalCheckStatus, id, status),
    )
    return id
  })

  handleRequest(
    IpcChannel.terminalWithheldServers,
    terminalWithheldServersRequestSchema,
    ({ id }) => manager.withheldServers(id),
  )

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

  // Unknown ids (a pane closed while paused) are no-ops in the manager.
  ipcMain.on(IpcChannel.terminalPause, (_event, payload: unknown) => {
    const request = parsePayload(terminalFlowRequestSchema, payload, IpcChannel.terminalPause)
    if (request) manager.pause(request.id)
  })

  ipcMain.on(IpcChannel.terminalResume, (_event, payload: unknown) => {
    const request = parsePayload(terminalFlowRequestSchema, payload, IpcChannel.terminalResume)
    if (request) manager.resume(request.id)
  })
}
