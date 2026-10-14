import { chmodSync, existsSync, mkdirSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { setupAgentHooks, type AgentHooks } from './setupAgentHooks'

const MCP_SERVER = { command: '/bin/node', script: '/app/mcp.js' }

function modeOf(path: string): number {
  return statSync(path).mode & 0o777
}

async function start(dataDir: string): Promise<AgentHooks> {
  return setupAgentHooks({
    dataDir,
    onSignal: vi.fn(),
    onRpc: vi.fn(),
    onSubagent: vi.fn(),
    mcpServer: MCP_SERVER,
  })
}

describe('setupAgentHooks', () => {
  let hooks: AgentHooks | null = null

  afterEach(async () => {
    await hooks?.close()
    hooks = null
  })

  test('creates the socket owner-only inside an owner-only folder', async () => {
    // Arrange
    const dataDir = mkdtempSync(join(tmpdir(), 'dugout-setup-'))

    // Act
    hooks = await start(dataDir)

    // Assert
    const { socketPath } = hooks.config
    expect(dirname(socketPath)).toBe(join(dataDir, 'hooks'))
    expect(modeOf(dirname(socketPath))).toBe(0o700)
    expect(modeOf(socketPath)).toBe(0o600)
  })

  test('tightens an existing socket folder that others could enter', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'dugout-setup-'))
    mkdirSync(join(dataDir, 'hooks'), { mode: 0o755 })
    chmodSync(join(dataDir, 'hooks'), 0o755)

    hooks = await start(dataDir)

    expect(modeOf(join(dataDir, 'hooks'))).toBe(0o700)
  })

  test('falls back to a private temp folder when the data path is too long for a socket', async () => {
    const dataDir = join(mkdtempSync(join(tmpdir(), 'dugout-setup-')), 'x'.repeat(100))
    mkdirSync(dataDir)

    hooks = await start(dataDir)

    const socketDir = dirname(hooks.config.socketPath)
    expect(hooks.config.socketPath.length).toBeLessThanOrEqual(100)
    expect(socketDir.startsWith(tmpdir())).toBe(true)
    expect(modeOf(socketDir)).toBe(0o700)
    await hooks.close()
    hooks = null
    expect(existsSync(socketDir)).toBe(false)
  })

  test('writes MCP configs owner-only in an owner-only folder, and removes them', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'dugout-setup-'))
    mkdirSync(join(dataDir, 'mcp'), { mode: 0o755 })
    chmodSync(join(dataDir, 'mcp'), 0o755)

    hooks = await start(dataDir)
    const files = hooks.config.mcp?.files
    const path = files?.write('term-1', '{}') ?? ''

    expect(path).toBe(join(dataDir, 'mcp', 'term-1.json'))
    expect(modeOf(join(dataDir, 'mcp'))).toBe(0o700)
    expect(modeOf(path)).toBe(0o600)
    files?.remove('term-1')
    expect(existsSync(path)).toBe(false)
  })

  test('issues each terminal its own token, and no shared one', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'dugout-setup-'))

    hooks = await start(dataDir)
    const { tokens } = hooks.config

    expect(tokens.issue('a')).not.toBe(tokens.issue('b'))
    expect(hooks.config).not.toHaveProperty('token')
  })
})
