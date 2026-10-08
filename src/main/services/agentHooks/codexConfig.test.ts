import { parse } from 'smol-toml'
import { describe, expect, test } from 'vitest'
import { codexConfigOverrides, tomlInline } from './codexConfig'

/** Parses one `key=value` override the way Codex would. */
function parseOverride(override: string): { key: string; value: unknown } {
  const index = override.indexOf('=')
  const key = override.slice(0, index)
  return { key, value: parse(`v = ${override.slice(index + 1)}`).v }
}

const MCP = {
  command: '/Apps/Dugout',
  args: ['/out/main/mcp.js'],
  env: { DUGOUT_TERMINAL_ID: 't-1' },
}

describe('tomlInline', () => {
  test('renders strings, numbers, booleans, arrays and tables as inline TOML', () => {
    const value = { name: 'a "quoted"\nline', n: 3, on: true, list: ['x', 'y'], nested: { k: 'v' } }
    expect(parse(`v = ${tomlInline(value)}`).v).toEqual(value)
  })

  test('quotes keys that are not bare', () => {
    expect(parse(`v = ${tomlInline({ 'needs quotes': 1 })}`).v).toEqual({ 'needs quotes': 1 })
  })
})

describe('codexConfigOverrides', () => {
  test('adds Dugout status hooks for each Codex event, async', () => {
    const overrides = codexConfigOverrides(MCP).map(parseOverride)
    const stop = overrides.find((o) => o.key === 'hooks.Stop')?.value as {
      hooks: { type: string; command: string; async: boolean }[]
    }[]
    expect(stop).toHaveLength(1)
    expect(stop[0]?.hooks[0]).toMatchObject({ type: 'command', async: true })
    expect(stop[0]?.hooks[0]?.command).toContain('/hooks/$DUGOUT_TERMINAL_ID/done')
    expect(overrides.map((o) => o.key)).toEqual(
      expect.arrayContaining([
        'hooks.SessionStart',
        'hooks.UserPromptSubmit',
        'hooks.PostToolUse',
        'hooks.PermissionRequest',
        'hooks.Stop',
        'hooks.SubagentStart',
        'hooks.SubagentStop',
      ]),
    )
  })

  test('adds the dugout MCP server without touching other servers', () => {
    const mcp = codexConfigOverrides(MCP)
      .map(parseOverride)
      .find((o) => o.key === 'mcp_servers.dugout')
    expect(mcp?.value).toEqual(MCP)
  })
})

test('hook overrides are identical for every terminal, so Codex trusts them once', () => {
  const other = { ...MCP, env: { DUGOUT_TERMINAL_ID: 't-2' } }
  const hooksOnly = (overrides: string[]) => overrides.filter((o) => o.startsWith('hooks.'))
  expect(hooksOnly(codexConfigOverrides(other))).toEqual(hooksOnly(codexConfigOverrides(MCP)))
})
