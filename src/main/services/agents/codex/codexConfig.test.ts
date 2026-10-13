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
  inheritedEnv: ['DUGOUT_HOOK_TOKEN'],
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
    expect(mcp?.value).toEqual({
      command: MCP.command,
      args: MCP.args,
      env: MCP.env,
      env_vars: ['DUGOUT_HOOK_TOKEN'],
    })
  })

  test('forwards the hook token by name, so it is never in the arguments (decision 059)', () => {
    const overrides = codexConfigOverrides(MCP).join('\n')
    expect(overrides).toContain('env_vars = ["DUGOUT_HOOK_TOKEN"]')
    expect(overrides).not.toMatch(/DUGOUT_HOOK_TOKEN = /)
  })
})

test('hook overrides are identical for every terminal, so Codex trusts them once', () => {
  const other = { ...MCP, env: { DUGOUT_TERMINAL_ID: 't-2' } }
  const hooksOnly = (overrides: string[]) => overrides.filter((o) => o.startsWith('hooks.'))
  expect(hooksOnly(codexConfigOverrides(other))).toEqual(hooksOnly(codexConfigOverrides(MCP)))
})

test('hook overrides stay byte-for-byte the same, or Codex asks every user to trust them again', () => {
  const hook = (event: string, signal: string, forwardsPayload = true) =>
    `hooks.${event}=[{ matcher = "", hooks = [{ type = "command", command = "[ -n \\"$DUGOUT_TERMINAL_ID\\" ] && ` +
    `curl -s -X POST --max-time 2 ${forwardsPayload ? '--data-binary @- ' : ''}--unix-socket \\"$DUGOUT_HOOK_SOCKET\\" ` +
    `-H \\"Authorization: Bearer $DUGOUT_HOOK_TOKEN\\" \\"http://dugout/hooks/$DUGOUT_TERMINAL_ID/${signal}\\" ` +
    `>/dev/null 2>&1 || true", async = true }] }]`
  expect(codexConfigOverrides(MCP).filter((o) => o.startsWith('hooks.'))).toEqual([
    hook('SessionStart', 'ready'),
    hook('UserPromptSubmit', 'working', false),
    hook('PostToolUse', 'tool-done'),
    hook('PermissionRequest', 'needs-input'),
    hook('Stop', 'done'),
    hook('SubagentStart', 'subagent-start'),
    hook('SubagentStop', 'subagent-stop'),
  ])
})
