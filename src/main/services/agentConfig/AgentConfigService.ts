import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { AgentConfig, InstructionsStatus, McpServer } from '@shared/agentConfig'
import { MCP_PRESETS } from '@shared/mcpPresets'
import { writeFileAtomic } from '../projects/atomicWrite'
import { codexSharing } from '../agents/codex/codexMcp'
import { AGENTS_MD, CLAUDE_MD_PATHS, importsAgentsMd, linkInstructions } from './instructions'
import { MCP_JSON, parseMcpJson, serializeMcpJson } from './mcpJson'
import { serversHash } from './serverApproval'

const PRESET_CODEX = Object.fromEntries(
  MCP_PRESETS.map((preset) => [preset.server.name, codexSharing(preset.server)]),
)

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function versionOf(text: string | null): string {
  return createHash('sha256')
    .update(text ?? '')
    .digest('hex')
}

/** A project's agent setup: `.mcp.json` servers and the AGENTS.md / CLAUDE.md instructions. */
export class AgentConfigService {
  /** `approvedHash`: the servers the project approved (decision 052), if any. */
  async read(root: string, approvedHash?: string): Promise<AgentConfig> {
    const [text, instructions] = await Promise.all([
      readOptional(join(root, MCP_JSON)),
      this.instructions(root),
    ])
    try {
      const { servers } = parseMcpJson(text)
      const codex = Object.fromEntries(servers.map((server) => [server.name, codexSharing(server)]))
      const hash = serversHash(servers)
      const approval = { hash, isApproved: hash === approvedHash }
      return {
        mcp: { ok: true, servers, codex, approval, version: versionOf(text) },
        instructions,
        presetCodex: PRESET_CODEX,
      }
    } catch (error) {
      return {
        mcp: { ok: false, error: (error as Error).message },
        instructions,
        presetCodex: PRESET_CODEX,
      }
    }
  }

  /** Writes the servers, keeping fields Dugout does not edit; refuses if the file changed since `version`. */
  async saveMcp(root: string, servers: readonly McpServer[], version: string): Promise<void> {
    const path = join(root, MCP_JSON)
    const text = await readOptional(path)
    if (versionOf(text) !== version) {
      throw new Error('.mcp.json changed on disk. Reload the agent settings and try again.')
    }
    await writeFileAtomic(path, serializeMcpJson(parseMcpJson(text).raw, servers))
  }

  /**
   * Refuses to approve servers unless `hash` is still what `.mcp.json` holds, so the approval
   * covers exactly the servers the user was shown (decision 052).
   */
  async checkApproval(root: string, hash: string): Promise<void> {
    const text = await readOptional(join(root, MCP_JSON))
    if (serversHash(parseMcpJson(text).servers) !== hash) {
      throw new Error('.mcp.json changed on disk. Review its servers again before approving them.')
    }
  }

  /** Makes AGENTS.md the shared instructions, with CLAUDE.md importing it. */
  async linkInstructions(root: string): Promise<void> {
    const status = await this.instructions(root)
    const claudePath = status.claudeMdPath ?? CLAUDE_MD_PATHS[0]
    const [agents, claude] = await Promise.all([
      readOptional(join(root, AGENTS_MD)),
      readOptional(join(root, claudePath)),
    ])
    const linked = linkInstructions({ agents, claude, claudePath })
    if (linked.agents !== agents) await writeFileAtomic(join(root, AGENTS_MD), linked.agents)
    if (linked.claude !== claude) await writeFileAtomic(join(root, claudePath), linked.claude)
  }

  private async instructions(root: string): Promise<InstructionsStatus> {
    const [agents, ...claudes] = await Promise.all([
      readOptional(join(root, AGENTS_MD)),
      ...CLAUDE_MD_PATHS.map((path) => readOptional(join(root, path))),
    ])
    const index = claudes.findIndex((text) => text !== null)
    const claudeMdPath = index === -1 ? null : (CLAUDE_MD_PATHS[index] ?? null)
    const claude = claudes[index] ?? null
    return {
      hasAgentsMd: agents !== null,
      claudeMdPath,
      importsAgentsMd:
        claude !== null && claudeMdPath !== null && importsAgentsMd(claude, claudeMdPath),
    }
  }
}
