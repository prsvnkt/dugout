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
import { handleRequest, type IpcMainLike } from './handle'

export function registerProjectIpc(store: ProjectStore, ipc?: IpcMainLike): void {
  handleRequest(IpcChannel.projectList, z.undefined(), () => store.list(), ipc)
  handleRequest(
    IpcChannel.projectAdd,
    projectAddRequestSchema,
    (request) => store.add(request),
    ipc,
  )
  handleRequest(
    IpcChannel.projectRemove,
    projectRemoveRequestSchema,
    ({ id }) => store.remove(id),
    ipc,
  )
  handleRequest(
    IpcChannel.projectSetDevCommand,
    projectSetDevCommandRequestSchema,
    (request) => store.setDevCommand(request.id, request.command),
    ipc,
  )
  handleRequest(
    IpcChannel.projectSetCheckCommand,
    projectSetCheckCommandRequestSchema,
    (request) => store.setCheckCommand(request.id, request.command),
    ipc,
  )
  handleRequest(
    IpcChannel.projectSetTaskSource,
    projectSetTaskSourceRequestSchema,
    ({ projectId, source }) => store.setTaskSource(projectId, source),
    ipc,
  )
  handleRequest(
    IpcChannel.projectSetWorktreeSetup,
    projectSetWorktreeSetupRequestSchema,
    ({ id, setup }) => store.setWorktreeSetup(id, setup),
    ipc,
  )
  handleRequest(
    IpcChannel.projectChangeTaskQueue,
    projectChangeTaskQueueRequestSchema,
    ({ id, change }) => store.changeTaskQueue(id, change),
    ipc,
  )
  handleRequest(
    IpcChannel.projectSetMaxAgents,
    projectSetMaxAgentsRequestSchema,
    (request) => store.setMaxAgents(request.id, request.maxAgents),
    ipc,
  )
}
