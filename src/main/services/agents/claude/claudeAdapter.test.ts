import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { buildHookSettings } from '../../agentHooks/hookSettings'
import { launchContext, MCP_ENTRY, memoryFiles } from '../testContext'
import { claudeAdapter, CLAUDE_SETTINGS_FILE } from './claudeAdapter'

describe('claudeAdapter', () => {
  test('passes the generated hook settings and the command to run', () => {
    const launch = claudeAdapter.launch(launchContext())
    expect(launch.commandLine).toBe('"$DUGOUT_CLAUDE_COMMAND" --settings "$DUGOUT_CLAUDE_SETTINGS"')
    expect(launch.env).toEqual({
      DUGOUT_CLAUDE_SETTINGS: '/data/claude-hooks.json',
      DUGOUT_CLAUDE_COMMAND: '/opt/fake/agent',
    })
  })

  test('adds --resume as separate arguments when resuming', () => {
    const launch = claudeAdapter.launch(launchContext({ isResuming: true }))
    expect(launch.commandLine).toBe(
      '"$DUGOUT_CLAUDE_COMMAND" --settings "$DUGOUT_CLAUDE_SETTINGS" --resume "$DUGOUT_RESUME_SESSION"',
    )
  })

  test('puts the first prompt before options and the MCP config last', () => {
    const files = memoryFiles()
    const launch = claudeAdapter.launch(
      launchContext({ hasInitialPrompt: true, mcp: { server: MCP_ENTRY, files } }),
    )
    expect(launch.commandLine).toBe(
      '"$DUGOUT_CLAUDE_COMMAND" "$DUGOUT_INITIAL_PROMPT" --settings "$DUGOUT_CLAUDE_SETTINGS"' +
        ' --mcp-config "$DUGOUT_MCP_CONFIG"',
    )
    expect(launch.env.DUGOUT_MCP_CONFIG).toBe('/data/mcp/t-1.json')
  })

  test('writes the dugout server to a per-terminal MCP config, removed on dispose', () => {
    const files = memoryFiles()
    const launch = claudeAdapter.launch(launchContext({ mcp: { server: MCP_ENTRY, files } }))

    expect(JSON.parse(files.contents.get('t-1') ?? '')).toEqual({
      mcpServers: { dugout: { type: 'stdio', ...MCP_ENTRY } },
    })
    launch.dispose?.()
    expect(files.contents.size).toBe(0)
  })

  test('prepare writes the hook settings file', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'dugout-claude-'))
    await claudeAdapter.prepare?.(dataDir)
    const written = JSON.parse(readFileSync(join(dataDir, CLAUDE_SETTINGS_FILE), 'utf8'))
    expect(written).toEqual(buildHookSettings())
  })
})
