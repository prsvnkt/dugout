import type { AgentSharing } from '@shared/agentConfig'
import { AGENT_LIST, type AgentInfo } from '@shared/agents'
import { listText } from '@renderer/lib/listText'

/** Agents that take a project's `.mcp.json` servers at all, in menu order. */
const MCP_TAKERS = AGENT_LIST.filter((agent) => agent.capabilities.projectMcp !== 'none')

const labels = (agents: readonly AgentInfo[]) => listText(agents.map((agent) => agent.label))

/** Why agents cannot use a server, for a tooltip; undefined when every agent can. */
export function notSharedReasons(sharing: AgentSharing | undefined): string | undefined {
  const reasons = Object.values(sharing ?? {}).flatMap((one) => (one.isShared ? [] : [one.reason]))
  return reasons.length > 0 ? reasons.join(' ') : undefined
}

/**
 * Which agents get an MCP server, and why others do not when they cannot. `isApproved`: whether
 * the project's servers are approved for agents with `needsMcpApproval` (decision 057); presets
 * are judged as if they were. Agents that take no `.mcp.json` servers are left out.
 */
export function sharingText(
  sharing: AgentSharing | undefined,
  isApproved = true,
  agents: readonly AgentInfo[] = MCP_TAKERS,
): string {
  const shared = agents.filter((agent) => sharing?.[agent.kind]?.isShared !== false)
  const reasons = notSharedReasons(sharing)
  if (shared.length < agents.length) {
    return shared.length > 0 ? `${labels(shared)} only: ${reasons}` : `Not shared: ${reasons}`
  }
  const waits = (agent: AgentInfo) => agent.capabilities.needsMcpApproval && !isApproved
  const now = shared.filter((agent) => !waits(agent))
  const later = shared.filter(waits)
  if (later.length === 0) return labels(now)
  return now.length > 0
    ? `${labels(now)}, and ${labels(later)} once approved`
    : `${labels(later)} once approved`
}

function projectMcpClause(agent: AgentInfo): string {
  const { projectMcp, needsMcpApproval } = agent.capabilities
  if (projectMcp === 'native') {
    return `${agent.productName} loads them itself and asks before it runs them`
  }
  if (projectMcp === 'none') return `${agent.label} agents get only Dugout's task tools for now`
  const approval = needsMcpApproval ? ', once you approve them below' : ''
  return `${agent.label} agents get the ones ${agent.label} can run${approval}`
}

/** How each agent gets the project's `.mcp.json` servers, from its `projectMcp` capability. */
export function projectMcpText(agents: readonly AgentInfo[] = AGENT_LIST): string {
  return `${agents.map(projectMcpClause).join('; ')}.`
}
