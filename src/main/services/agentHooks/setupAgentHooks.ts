import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HookSignal } from '@shared/agentStatus'
import type { HookDetails } from './HookServer'
import { writeFileAtomic } from '../projects/atomicWrite'
import { HookServer } from './HookServer'
import { buildHookSettings } from './hookSettings'

export interface AgentHooksConfig {
  readonly settingsPath: string
  readonly socketPath: string
  readonly token: string
  readonly claudeCommand?: string | undefined
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
}): Promise<AgentHooks> {
  const settingsPath = join(options.dataDir, SETTINGS_FILE)
  const socketPath = chooseSocketPath(options.dataDir)
  const token = randomBytes(TOKEN_BYTES).toString('hex')

  await writeFileAtomic(settingsPath, `${JSON.stringify(buildHookSettings(), null, 2)}\n`)
  const server = new HookServer({ socketPath, token, onSignal: options.onSignal })
  await server.listen()

  return {
    config: { settingsPath, socketPath, token, claudeCommand: options.claudeCommand },
    close: () => server.close(),
  }
}
