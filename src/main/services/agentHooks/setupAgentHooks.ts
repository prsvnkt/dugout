import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentKind } from '@shared/agents'
import type { HookSignal } from '@shared/agentStatus'
import type { HookDetails, HookServerDeps } from './HookServer'
import { HookServer } from './HookServer'
import type { TerminalFiles } from '../agents/AgentAdapter'
import type { McpServerLaunch } from '../agents/dugoutMcp'
import { AGENT_ADAPTERS } from '../agents/registry'

export interface AgentHooksConfig {
  /** App data folder, where adapters keep their static files (hook settings, plugins). */
  readonly dataDir: string
  readonly socketPath: string
  readonly token: string
  /** The command each agent runs; missing ones use the adapter's default. */
  readonly commands?: Partial<Readonly<Record<AgentKind, string>>>
  /** Dugout's task server, given to every agent that supports MCP. */
  readonly mcp?: { readonly server: McpServerLaunch; readonly files: TerminalFiles }
}

export interface AgentHooks {
  readonly config: AgentHooksConfig
  close(): Promise<void>
}

const SOCKET_FILE = 'hooks.sock'
/** macOS limits Unix socket paths to 104 bytes. */
const MAX_SOCKET_PATH_LENGTH = 100
const TOKEN_BYTES = 32
const MCP_DIR = 'mcp'
const OWNER_ONLY = 0o600

/** One MCP config per terminal: the server needs to know which terminal (and project) it serves. */
function mcpConfigFiles(dataDir: string): TerminalFiles {
  const dir = join(dataDir, MCP_DIR)
  mkdirSync(dir, { recursive: true })
  return {
    write(terminalId, content) {
      const path = join(dir, `${terminalId}.json`)
      writeFileSync(path, content, { mode: OWNER_ONLY })
      return path
    },
    remove(terminalId) {
      rmSync(join(dir, `${terminalId}.json`), { force: true })
    },
  }
}

function chooseSocketPath(dataDir: string): string {
  const preferred = join(dataDir, SOCKET_FILE)
  return preferred.length <= MAX_SOCKET_PATH_LENGTH
    ? preferred
    : join(tmpdir(), `dugout-${process.pid}.sock`)
}

/** Writes each agent's hook files and starts the socket server that receives the signals. */
export async function setupAgentHooks(options: {
  readonly dataDir: string
  readonly commands?: AgentHooksConfig['commands']
  readonly onSignal: (terminalId: string, signal: HookSignal, details: HookDetails) => void
  readonly onRpc: HookServerDeps['onRpc']
  readonly onSubagent: HookServerDeps['onSubagent']
  readonly mcpServer?: McpServerLaunch | undefined
}): Promise<AgentHooks> {
  const socketPath = chooseSocketPath(options.dataDir)
  const token = randomBytes(TOKEN_BYTES).toString('hex')

  await Promise.all(
    Object.values(AGENT_ADAPTERS).map((adapter) => adapter.prepare?.(options.dataDir)),
  )
  const server = new HookServer({
    socketPath,
    token,
    onSignal: options.onSignal,
    onRpc: options.onRpc,
    onSubagent: options.onSubagent,
  })
  await server.listen()

  return {
    config: {
      dataDir: options.dataDir,
      socketPath,
      token,
      ...(options.commands && { commands: options.commands }),
      ...(options.mcpServer && {
        mcp: { server: options.mcpServer, files: mcpConfigFiles(options.dataDir) },
      }),
    },
    close: () => server.close(),
  }
}
