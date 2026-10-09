import { IpcChannel } from '@shared/ipc/channels'
import {
  agentConfigApproveServersRequestSchema,
  agentConfigRequestSchema,
  agentConfigSaveMcpRequestSchema,
} from '@shared/ipc/contract'
import type { AgentConfig } from '@shared/agentConfig'
import type { AgentConfigService } from '../services/agentConfig/AgentConfigService'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { handleRequest } from './handle'
import { findProject } from './registerGitIpc'

/** A project's `.mcp.json` and agent instructions, always at the project's main checkout. */
export function registerAgentConfigIpc(
  projects: ProjectStore,
  agentConfig: AgentConfigService,
): void {
  const rootOf = (projectId: string) => findProject(projects, projectId).rootPath

  handleRequest(
    IpcChannel.agentConfigRead,
    agentConfigRequestSchema,
    ({ projectId }): Promise<AgentConfig> => {
      const project = findProject(projects, projectId)
      return agentConfig.read(project.rootPath, project.approvedMcpServers)
    },
  )
  // Approves only what the main checkout's .mcp.json holds now (decision 052).
  handleRequest(
    IpcChannel.agentConfigApproveServers,
    agentConfigApproveServersRequestSchema,
    async ({ projectId, hash }) => {
      if (hash !== null) await agentConfig.checkApproval(rootOf(projectId), hash)
      await projects.setApprovedMcpServers(projectId, hash)
    },
  )
  handleRequest(
    IpcChannel.agentConfigSaveMcp,
    agentConfigSaveMcpRequestSchema,
    ({ projectId, servers, version }) => agentConfig.saveMcp(rootOf(projectId), servers, version),
  )
  handleRequest(IpcChannel.agentConfigLinkInstructions, agentConfigRequestSchema, ({ projectId }) =>
    agentConfig.linkInstructions(rootOf(projectId)),
  )
}
