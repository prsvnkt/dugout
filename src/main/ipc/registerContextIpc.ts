import { BrowserWindow, dialog, type IpcMainInvokeEvent } from 'electron'
import type { AgentKind } from '@shared/agents'
import { IpcChannel } from '@shared/ipc/channels'
import {
  contextAddRequestSchema,
  contextCodemapRequestSchema,
  contextEditRequestSchema,
  contextIdRequestSchema,
  contextImportRequestSchema,
  contextProjectRequestSchema,
} from '@shared/ipc/contextContract'
import type { ContextProject, ContextStore } from '../services/context/ContextStore'
import { IMPORTABLE_EXTENSIONS, readImportedDoc } from '../services/context/importDoc'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { handleRequest, type IpcMainLike } from './handle'
import { findProject } from './registerGitIpc'

export interface ContextIpcDeps {
  readonly projects: ProjectStore
  readonly store: ContextStore
  /** Runs the agent headlessly at `root` and resolves to the codemap's Markdown. */
  readonly buildCodemap: (agent: AgentKind, root: string) => Promise<string>
  /** Asks the user for a document to import; the native open dialog by default. */
  readonly pickDocument?: (event: IpcMainInvokeEvent) => Promise<string | null>
}

async function pickDocument(event: IpcMainInvokeEvent): Promise<string | null> {
  const window = BrowserWindow.fromWebContents(event.sender)
  const options = {
    properties: ['openFile' as const],
    filters: [{ name: 'Markdown or text', extensions: IMPORTABLE_EXTENSIONS }],
  }
  const result = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options)
  return result.canceled ? null : (result.filePaths[0] ?? null)
}

/** The Context tab: a project's entries (always at its main checkout) and agents' proposals. */
export function registerContextIpc(
  { projects, store, buildCodemap, pickDocument: pick = pickDocument }: ContextIpcDeps,
  ipc?: IpcMainLike,
): void {
  const projectOf = (projectId: string): ContextProject => findProject(projects, projectId)
  const building = new Set<string>()

  handleRequest(
    IpcChannel.contextRead,
    contextProjectRequestSchema,
    ({ projectId }) => store.read(projectOf(projectId)),
    ipc,
  )
  handleRequest(
    IpcChannel.contextAdd,
    contextAddRequestSchema,
    ({ projectId, entry }) => store.add(projectOf(projectId), entry),
    ipc,
  )
  handleRequest(
    IpcChannel.contextEdit,
    contextEditRequestSchema,
    ({ projectId, ...edit }) => store.edit(projectOf(projectId), edit),
    ipc,
  )
  handleRequest(
    IpcChannel.contextRemove,
    contextIdRequestSchema,
    ({ projectId, id }) => store.remove(projectOf(projectId), id),
    ipc,
  )
  handleRequest(
    IpcChannel.contextRepin,
    contextIdRequestSchema,
    ({ projectId, id }) => store.repin(projectOf(projectId), id),
    ipc,
  )
  handleRequest(
    IpcChannel.contextApprove,
    contextIdRequestSchema,
    ({ projectId, id }) => store.approve(projectOf(projectId), id),
    ipc,
  )
  handleRequest(
    IpcChannel.contextDiscard,
    contextIdRequestSchema,
    ({ projectId, id }) => store.discard(projectOf(projectId), id),
    ipc,
  )
  handleRequest(
    IpcChannel.contextImportDoc,
    contextImportRequestSchema,
    async ({ projectId, scope }, event) => {
      const project = projectOf(projectId)
      const path = await pick(event)
      if (!path) return null
      return store.addDoc(project, scope, await readImportedDoc(path))
    },
    ipc,
  )
  handleRequest(
    IpcChannel.contextBuildCodemap,
    contextCodemapRequestSchema,
    async ({ projectId, agent }) => {
      const project = projectOf(projectId)
      if (building.has(projectId)) throw new Error('A codemap is already being built.')
      building.add(projectId)
      try {
        return await store.saveCodemap(project, agent, await buildCodemap(agent, project.rootPath))
      } finally {
        building.delete(projectId)
      }
    },
    ipc,
  )
}
