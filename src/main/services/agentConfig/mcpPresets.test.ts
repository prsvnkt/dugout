import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { literalSecrets, MCP_SERVER_NAME, RESERVED_MCP_SERVER } from '@shared/agentConfig'
import { agentConfigSaveMcpRequestSchema } from '@shared/ipc/contract'
import { MCP_PRESETS } from '@shared/mcpPresets'
import { AgentConfigService } from './AgentConfigService'
import { codexSharing } from './codexMcp'
import { parseMcpJson, serializeMcpJson } from './mcpJson'

const VARIABLE = /\$\{([^}]*)\}/g
const VARIABLE_NAME = /^[A-Z_][A-Z0-9_]*$/

function textOf(preset: (typeof MCP_PRESETS)[number]): string[] {
  const { server } = preset
  return server.type === 'stdio'
    ? [server.command, ...server.args, ...Object.values(server.env)]
    : [server.url, ...Object.values(server.headers)]
}

describe('MCP_PRESETS', () => {
  test('have unique, valid server names that are not Dugout’s own', () => {
    const names = MCP_PRESETS.map((preset) => preset.server.name)

    expect(new Set(names).size).toBe(names.length)
    for (const name of names) {
      expect(name).toMatch(MCP_SERVER_NAME)
      expect(name).not.toBe(RESERVED_MCP_SERVER)
    }
  })

  test.each(MCP_PRESETS)('$label passes the save request schema', (preset) => {
    const request = { projectId: 'p', servers: [preset.server], version: 'v' }

    expect(agentConfigSaveMcpRequestSchema.safeParse(request).success).toBe(true)
  })

  test.each(MCP_PRESETS)('$label survives a write and read of .mcp.json unchanged', (preset) => {
    const text = serializeMcpJson(null, [preset.server])

    expect(parseMcpJson(text).servers).toEqual([preset.server])
  })

  test.each(MCP_PRESETS)('$label holds secrets only as ${VAR} references', (preset) => {
    const variables = textOf(preset).flatMap((part) =>
      [...part.matchAll(VARIABLE)].map((match) => match[1]),
    )

    expect(literalSecrets(preset.server)).toEqual([])
    for (const variable of variables) expect(variable).toMatch(VARIABLE_NAME)
  })

  test.each(MCP_PRESETS)('$label remote URL is https', (preset) => {
    if (preset.server.type === 'stdio') return

    expect(new URL(preset.server.url).protocol).toBe('https:')
  })

  test('come with whether Codex agents can use each one, by the .mcp.json translation rules', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dugout-mcp-presets-'))

    const { presetCodex } = await new AgentConfigService().read(root)

    expect(presetCodex).toEqual(
      Object.fromEntries(
        MCP_PRESETS.map((preset) => [preset.server.name, codexSharing(preset.server)]),
      ),
    )
    expect(presetCodex.github).toEqual({ isShared: true })
  })
})
