import { randomBytes } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HookSignal } from '@shared/agentStatus'
import type { HookDetails, HookServerDeps } from './HookServer'
import { writeFileAtomic } from '../projects/atomicWrite'
import { HookServer } from './HookServer'
import { codexConfigOverrides } from './codexConfig'
import { buildHookSettings } from './hookSettings'

export interface AgentHooksConfig {
  readonly settingsPath: string
  readonly socketPath: string
  readonly token: string
  readonly claudeCommand?: string | undefined
  /** Writes the terminal's MCP config (Dugout task tools) and returns its path. */
  readonly writeMcpConfig?: (terminalId: string) => string
  readonly removeMcpConfig?: (terminalId: string) => void
  /** Codex `-c` overrides for a terminal: status hooks plus the dugout MCP server. */
  readonly codexOverrides?: (terminalId: string) => string[]
  readonly codexCommand?: string | undefined
}

export interface AgentHooks {
  readonly config: AgentHooksConfig
  close(): Promise<void>
}

const SETTINGS_FILE = 'claude-hooks.json'
const SOCKET_FILE = 'hooks.sock'
/** macOS limits Unix socket paths to 104 bytes. */
const MAX_SOCKET_PATH_LENGTH = 100
const TOKEN_BYTES = 32
const MCP_DIR = 'mcp'
const OWNER_ONLY = 0o600

export interface McpServerLaunch {
  /** The executable that runs the server (Electron, in Node mode). */
  readonly command: string
  readonly script: string
}

function mcpServerEntry(
  launch: McpServerLaunch,
  socketPath: string,
  token: string,
  terminalId: string,
) {
  return {
    command: launch.command,
    args: [launch.script],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      DUGOUT_HOOK_SOCKET: socketPath,
      DUGOUT_HOOK_TOKEN: token,
      DUGOUT_TERMINAL_ID: terminalId,
    },
  }
}

/** One config per terminal: the server needs to know which terminal (and project) it serves. */
function mcpConfigWriter(
  dataDir: string,
  socketPath: string,
  token: string,
  launch: McpServerLaunch,
) {
  const dir = join(dataDir, MCP_DIR)
  mkdirSync(dir, { recursive: true })
  return {
    write(terminalId: string): string {
      const path = join(dir, `${terminalId}.json`)
      const config = {
        mcpServers: {
          dugout: { type: 'stdio', ...mcpServerEntry(launch, socketPath, token, terminalId) },
        },
      }
      writeFileSync(path, JSON.stringify(config, null, 2), { mode: OWNER_ONLY })
      return path
    },
    remove(terminalId: string): void {
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

/** Writes the hook settings file and starts the socket server that receives the signals. */
export async function setupAgentHooks(options: {
  readonly dataDir: string
  readonly claudeCommand?: string | undefined
  readonly onSignal: (terminalId: string, signal: HookSignal, details: HookDetails) => void
  readonly onRpc: HookServerDeps['onRpc']
  readonly mcpServer?: McpServerLaunch | undefined
  readonly codexCommand?: string | undefined
}): Promise<AgentHooks> {
  const settingsPath = join(options.dataDir, SETTINGS_FILE)
  const socketPath = chooseSocketPath(options.dataDir)
  const token = randomBytes(TOKEN_BYTES).toString('hex')

  await writeFileAtomic(settingsPath, `${JSON.stringify(buildHookSettings(), null, 2)}\n`)
  const server = new HookServer({
    socketPath,
    token,
    onSignal: options.onSignal,
    onRpc: options.onRpc,
  })
  await server.listen()
  const mcp = options.mcpServer
    ? mcpConfigWriter(options.dataDir, socketPath, token, options.mcpServer)
    : null

  return {
    config: {
      settingsPath,
      socketPath,
      token,
      claudeCommand: options.claudeCommand,
      ...(mcp && { writeMcpConfig: mcp.write, removeMcpConfig: mcp.remove }),
      codexCommand: options.codexCommand,
      ...(options.mcpServer && {
        codexOverrides: (terminalId: string) =>
          codexConfigOverrides(
            mcpServerEntry(options.mcpServer as McpServerLaunch, socketPath, token, terminalId),
          ),
      }),
    },
    close: () => server.close(),
  }
}
