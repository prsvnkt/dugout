import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { workspaceSnapshotSchema } from '@shared/ipc/contract'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { LayoutStore } from '../services/workspace/LayoutStore'
import { handleRequest, type IpcMainLike } from './handle'

export function registerWorkspaceIpc(
  layouts: LayoutStore,
  projects: ProjectStore,
  ipc?: IpcMainLike,
): void {
  handleRequest(
    IpcChannel.workspaceLoad,
    z.undefined(),
    () => layouts.load(projects.list().map((project) => project.id)),
    ipc,
  )
  handleRequest(
    IpcChannel.workspaceSave,
    workspaceSnapshotSchema,
    (snapshot) => layouts.save(snapshot),
    ipc,
  )
}
