import { createHash } from 'node:crypto'
import type {
  AgentConfig,
  AgentSharing,
  InstructionsStatus,
  McpServer,
  McpSharing,
  OwnInstructions,
} from '@shared/agentConfig'
import { SHARED_INSTRUCTIONS_FILE } from '@shared/agents'
import { MCP_PRESETS } from '@shared/mcpPresets'
import type { AgentAdapter } from '../agents/AgentAdapter'
import { AGENT_ADAPTERS } from '../agents/registry'
import type { FileService } from '../files/FileService'
import { importsShared, linkInstructions } from './instructions'
import { MCP_JSON, parseMcpJson, serializeMcpJson } from './mcpJson'
import { serversHash } from './serverApproval'

const SHARED: McpSharing = { isShared: true }

/** What the service needs from `FileService`: path-safe reads and writes inside the checkout. */
export type AgentConfigFiles = Pick<FileService, 'readText' | 'writeText'>

/** An agent with its own instructions file, and how that file imports AGENTS.md. */
interface Importer {
  readonly adapter: AgentAdapter
  readonly importLine: (path: string) => string
}

function versionOf(text: string | null): string {
  return createHash('sha256')
    .update(text ?? '')
    .digest('hex')
}

/**
 * A project's agent setup: `.mcp.json` servers and the shared AGENTS.md instructions, read
 * through each agent's adapter (decision 061), so no agent is special-cased here. Every file goes
 * through `FileService`, so a symlink out of the checkout (or into `.git`) is refused (decision 063).
 */
export class AgentConfigService {
  private readonly presetSharing: Readonly<Record<string, AgentSharing>>
  private readonly importers: readonly Importer[]

  constructor(
    private readonly files: AgentConfigFiles,
    private readonly adapters: readonly AgentAdapter[] = Object.values(AGENT_ADAPTERS),
  ) {
    this.presetSharing = this.sharingByName(MCP_PRESETS.map((preset) => preset.server))
    this.importers = adapters.flatMap((adapter) =>
      adapter.instructionsImport ? [{ adapter, importLine: adapter.instructionsImport }] : [],
    )
  }

  /** `approvedHash`: the servers the project approved (decision 057), if any. */
  async read(root: string, approvedHash?: string): Promise<AgentConfig> {
    const [text, instructions] = await Promise.all([
      this.files.readText(root, MCP_JSON),
      this.instructions(root),
    ])
    const presetSharing = this.presetSharing
    try {
      const { servers } = parseMcpJson(text)
      const hash = serversHash(servers)
      const approval = { hash, isApproved: hash === approvedHash }
      const sharing = this.sharingByName(servers)
      return {
        mcp: { ok: true, servers, sharing, approval, version: versionOf(text) },
        instructions,
        presetSharing,
      }
    } catch (error) {
      return { mcp: { ok: false, error: (error as Error).message }, instructions, presetSharing }
    }
  }

  /** Writes the servers, keeping fields Dugout does not edit; refuses if the file changed since `version`. */
  async saveMcp(root: string, servers: readonly McpServer[], version: string): Promise<void> {
    const text = await this.files.readText(root, MCP_JSON)
    if (versionOf(text) !== version) {
      throw new Error('.mcp.json changed on disk. Reload the agent settings and try again.')
    }
    await this.files.writeText(root, MCP_JSON, serializeMcpJson(parseMcpJson(text).raw, servers))
  }

  /**
   * Refuses to approve servers unless `hash` is still what `.mcp.json` holds, so the approval
   * covers exactly the servers the user was shown (decision 057).
   */
  async checkApproval(root: string, hash: string): Promise<void> {
    const text = await this.files.readText(root, MCP_JSON)
    if (serversHash(parseMcpJson(text).servers) !== hash) {
      throw new Error('.mcp.json changed on disk. Review its servers again before approving them.')
    }
  }

  /** Makes AGENTS.md the shared instructions, with each agent's own file importing it. */
  async linkInstructions(root: string): Promise<void> {
    const original = await this.files.readText(root, SHARED_INSTRUCTIONS_FILE)
    let shared = original
    for (const importer of this.importers) {
      const { info } = importer.adapter
      const status = await this.ownInstructions(root, importer)
      // The contract test guarantees every agent declares at least one file.
      const path = status.path ?? info.instructionsFiles[0] ?? SHARED_INSTRUCTIONS_FILE
      const own = await this.files.readText(root, path)
      const linked = linkInstructions({
        shared,
        own,
        importLine: importer.importLine(path),
        heading: `## ${info.label}-only notes`,
      })
      if (linked.own !== own) await this.files.writeText(root, path, linked.own)
      shared = linked.shared
    }
    if (shared !== null && shared !== original) {
      await this.files.writeText(root, SHARED_INSTRUCTIONS_FILE, shared)
    }
  }

  /** For each server, whether each agent that takes `.mcp.json` servers gets it. */
  private sharingByName(servers: readonly McpServer[]): Record<string, AgentSharing> {
    const takers = this.adapters.filter(
      (adapter) => adapter.info.capabilities.projectMcp !== 'none',
    )
    const sharing = (server: McpServer): AgentSharing =>
      Object.fromEntries(
        takers.map((adapter) => [adapter.info.kind, adapter.projectMcpSharing?.(server) ?? SHARED]),
      )
    return Object.fromEntries(servers.map((server) => [server.name, sharing(server)]))
  }

  private async instructions(root: string): Promise<InstructionsStatus> {
    const [shared, ownFiles] = await Promise.all([
      this.files.readText(root, SHARED_INSTRUCTIONS_FILE),
      Promise.all(this.importers.map((importer) => this.ownInstructions(root, importer))),
    ])
    return { hasSharedFile: shared !== null, ownFiles }
  }

  /** The first of the agent's instruction files that exists, and whether it imports AGENTS.md. */
  private async ownInstructions(root: string, importer: Importer): Promise<OwnInstructions> {
    const { kind, instructionsFiles } = importer.adapter.info
    const texts = await Promise.all(
      instructionsFiles.map((path) => this.files.readText(root, path)),
    )
    const index = texts.findIndex((text) => text !== null)
    const path = instructionsFiles[index] ?? null
    const text = texts[index] ?? null
    return {
      kind,
      path,
      importsShared:
        text !== null && path !== null && importsShared(text, importer.importLine(path)),
    }
  }
}
