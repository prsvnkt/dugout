import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import {
  projectAddRequestSchema,
  projectChangeTaskQueueRequestSchema,
  projectRemoveRequestSchema,
  projectSetDevCommandRequestSchema,
  projectSetMaxAgentsRequestSchema,
  projectSetCheckCommandRequestSchema,
  projectSetTaskSourceRequestSchema,
  projectSetWorktreeSetupRequestSchema,
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
  handleRequest(
    IpcChannel.projectSetTaskSource,
    projectSetTaskSourceRequestSchema,
    ({ projectId, source }) => store.setTaskSource(projectId, source),
  )
  handleRequest(
    IpcChannel.projectSetWorktreeSetup,
    projectSetWorktreeSetupRequestSchema,
    ({ id, setup }) => store.setWorktreeSetup(id, setup),
  )
  handleRequest(
    IpcChannel.projectChangeTaskQueue,
    projectChangeTaskQueueRequestSchema,
    ({ id, change }) => store.changeTaskQueue(id, change),
  )
  handleRequest(IpcChannel.projectSetMaxAgents, projectSetMaxAgentsRequestSchema, (request) =>
    store.setMaxAgents(request.id, request.maxAgents),
  )
}
