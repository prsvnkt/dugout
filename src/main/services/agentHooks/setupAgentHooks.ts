import { chmodSync, lstatSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AgentKind } from '@shared/agents'
import type { HookSignal } from '@shared/agentStatus'
import type { HookDetails, HookServerDeps } from './HookServer'
import { HookServer } from './HookServer'
import { HookTokens, type HookTokenIssuer } from './hookTokens'
import type { TerminalFiles } from '../agents/AgentAdapter'
import type { McpServerLaunch } from '../agents/dugoutMcp'
import { AGENT_ADAPTERS } from '../agents/registry'

export interface AgentHooksConfig {
  /** App data folder, where adapters keep their static files (hook settings, plugins). */
  readonly dataDir: string
  readonly socketPath: string
  /** Issues each agent terminal its own hook token and forgets it on exit (decision 059). */
  readonly tokens: HookTokenIssuer
  /** The command each agent runs; missing ones use the adapter's default. */
  readonly commands?: Partial<Readonly<Record<AgentKind, string>>>
  /** Dugout's task server, given to every agent that supports MCP. */
  readonly mcp?: { readonly server: McpServerLaunch; readonly files: TerminalFiles }
}

export interface AgentHooks {
  readonly config: AgentHooksConfig
  close(): Promise<void>
}

const SOCKET_DIR = 'hooks'
const SOCKET_FILE = 'hooks.sock'
/** macOS limits Unix socket paths to 104 bytes. */
const MAX_SOCKET_PATH_LENGTH = 100
const MCP_DIR = 'mcp'
const OWNER_ONLY = 0o600
const OWNER_ONLY_DIR = 0o700

/**
 * A folder only the current user can enter. `mkdir`'s mode applies only when it creates the
 * folder, so an existing one is tightened too; a symlink in its place is refused.
 */
function privateDir(path: string): string {
  mkdirSync(path, { recursive: true, mode: OWNER_ONLY_DIR })
  if (!lstatSync(path).isDirectory()) throw new Error(`${path} is not a folder.`)
  chmodSync(path, OWNER_ONLY_DIR)
  return path
}

/**
 * One MCP config per terminal: the server needs to know which terminal (and project) it serves.
 * The configs carry no token (decision 059); the folder and files are owner-only all the same.
 */
function mcpConfigFiles(dataDir: string): TerminalFiles {
  const dir = privateDir(join(dataDir, MCP_DIR))
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

interface SocketLocation {
  readonly socketPath: string
  /** Removes what was made for the socket beyond the socket file itself. */
  readonly cleanUp: () => void
}

/**
 * The socket is created inside an owner-only folder, so no other user can reach it even in the
 * moment between `listen` and its `chmod`. When the app data path is too long for a socket path,
 * a fresh `mkdtemp` folder (always 0700) in the temp dir is used instead.
 */
function chooseSocketLocation(dataDir: string): SocketLocation {
  const preferredDir = join(dataDir, SOCKET_DIR)
  if (join(preferredDir, SOCKET_FILE).length <= MAX_SOCKET_PATH_LENGTH) {
    return { socketPath: join(privateDir(preferredDir), SOCKET_FILE), cleanUp: () => {} }
  }
  const dir = mkdtempSync(join(tmpdir(), 'dugout-'))
  return {
    socketPath: join(dir, SOCKET_FILE),
    cleanUp: () => rmSync(dir, { recursive: true, force: true }),
  }
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
  const { socketPath, cleanUp } = chooseSocketLocation(options.dataDir)
  const tokens = new HookTokens()

  await Promise.all(
    Object.values(AGENT_ADAPTERS).map((adapter) => adapter.prepare?.(options.dataDir)),
  )
  const server = new HookServer({
    socketPath,
    tokens,
    onSignal: options.onSignal,
    onRpc: options.onRpc,
    onSubagent: options.onSubagent,
  })
  await server.listen()

  return {
    config: {
      dataDir: options.dataDir,
      socketPath,
      tokens,
      ...(options.commands && { commands: options.commands }),
      ...(options.mcpServer && {
        mcp: { server: options.mcpServer, files: mcpConfigFiles(options.dataDir) },
      }),
    },
    close: async () => {
      await server.close()
      cleanUp()
    },
  }
}
