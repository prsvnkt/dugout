import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import {
  projectAddRequestSchema,
  projectRemoveRequestSchema,
  projectSetDevCommandRequestSchema,
  projectSetCheckCommandRequestSchema,
} from '@shared/ipc/contract'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { handleRequest } from './handle'

export function registerProjectIpc(store: ProjectStore): void {
  handleRequest(IpcChannel.projectList, z.undefined(), () => store.list())
  handleRequest(IpcChannel.projectAdd, projectAddRequestSchema, (request) => store.add(request))
  handleRequest(IpcChannel.projectRemove, projectRemoveRequestSchema, ({ id }) => store.remove(id))
  handleRequest(IpcChannel.projectSetDevCommand, projectSetDevCommandRequestSchema, (request) =>
    store.setDevCommand(request.id, request.command),
  )
  handleRequest(IpcChannel.projectSetCheckCommand, projectSetCheckCommandRequestSchema, (request) =>
    store.setCheckCommand(request.id, request.command),
  )
}
