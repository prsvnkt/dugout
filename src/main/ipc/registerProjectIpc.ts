import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import {
  projectAddRequestSchema,
  projectRemoveRequestSchema,
  projectUpdateRequestSchema,
} from '@shared/ipc/contract'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { handleRequest } from './handle'

export function registerProjectIpc(store: ProjectStore): void {
  handleRequest(IpcChannel.projectList, z.undefined(), () => store.list())
  handleRequest(IpcChannel.projectAdd, projectAddRequestSchema, (request) => store.add(request))
  handleRequest(IpcChannel.projectUpdate, projectUpdateRequestSchema, ({ id, ...patch }) =>
    store.update(id, patch),
  )
  handleRequest(IpcChannel.projectRemove, projectRemoveRequestSchema, ({ id }) => store.remove(id))
}
