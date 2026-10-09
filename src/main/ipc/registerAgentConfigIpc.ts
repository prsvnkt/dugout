import { IpcChannel } from '@shared/ipc/channels'
import { agentConfigRequestSchema, agentConfigSaveMcpRequestSchema } from '@shared/ipc/contract'
import type { AgentConfig } from '@shared/agentConfig'
import type { AgentConfigService } from '../services/agentConfig/AgentConfigService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { handleRequest, type IpcMainLike } from './handle'
import { findProject } from './registerGitIpc'

/** A project's `.mcp.json` and agent instructions, always at the project's main checkout. */
export function registerAgentConfigIpc(
  projects: ProjectStore,
  agentConfig: AgentConfigService,
  ipc?: IpcMainLike,
): void {
  const rootOf = (projectId: string) => findProject(projects, projectId).rootPath

  handleRequest(
    IpcChannel.agentConfigRead,
    agentConfigRequestSchema,
    ({ projectId }): Promise<AgentConfig> => agentConfig.read(rootOf(projectId)),
    ipc,
  )
  handleRequest(
    IpcChannel.agentConfigSaveMcp,
    agentConfigSaveMcpRequestSchema,
    ({ projectId, servers, version }) => agentConfig.saveMcp(rootOf(projectId), servers, version),
    ipc,
  )
  handleRequest(
    IpcChannel.agentConfigLinkInstructions,
    agentConfigRequestSchema,
    ({ projectId }) => agentConfig.linkInstructions(rootOf(projectId)),
    ipc,
  )
}
