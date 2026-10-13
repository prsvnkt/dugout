import type { WithheldServers } from '@shared/agentConfig'
import { readProjectServers } from '../../agentConfig/serverApproval'
import { tomlInline } from './codexConfig'
import { codexMcpServer } from './codexMcp'

export interface CodexProjectServers {
  /** `-c mcp_servers.<name>=…` overrides; empty unless the file's servers are approved. */
  readonly overrides: readonly string[]
  /** The servers left out for want of approval; null when nothing was left out. */
  readonly withheld: WithheldServers | null
}

const NONE: CodexProjectServers = { overrides: [], withheld: null }

/**
 * The servers in a Codex agent's checkout's `.mcp.json`, read when it starts. Codex has no
 * project file of its own that it asks about, and session-flag config is not gated, so they are
 * passed only when the project approved exactly these servers (`approvedHash`, decision 057).
 * Servers Codex cannot express are left out either way.
 */
export function codexProjectServers(
  cwd: string,
  approvedHash: string | undefined,
): CodexProjectServers {
  const project = readProjectServers(cwd)
  if (!project) return NONE
  const shareable = project.servers.flatMap((server) => {
    const result = codexMcpServer(server)
    return result.ok ? [{ server, config: result.config }] : []
  })
  if (shareable.length === 0) return NONE
  if (project.hash !== approvedHash) {
    const servers = shareable.map(({ server }) => server)
    return { overrides: [], withheld: { servers, hash: project.hash } }
  }
  const overrides = shareable.map(
    ({ server, config }) => `mcp_servers.${server.name}=${tomlInline(config)}`,
  )
  return { overrides, withheld: null }
}
