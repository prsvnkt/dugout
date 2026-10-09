import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, test } from 'vitest'
import { launchContext, MCP_ENTRY, memoryFiles } from '../testContext'
import { OPENCODE_PLUGIN_FILE, opencodeAdapter } from './opencodeAdapter'
import { OPENCODE_STATUS_PLUGIN } from './statusPlugin'

const inlineConfig = (env: Readonly<Record<string, string>>) =>
  JSON.parse(env.OPENCODE_CONFIG_CONTENT ?? '{}') as Record<string, unknown>

describe('opencodeAdapter', () => {
  test('starts the TUI with the command to run', () => {
    const launch = opencodeAdapter.launch(launchContext())
    expect(launch.commandLine).toBe('"$DUGOUT_OPENCODE_COMMAND"')
    expect(launch.env.DUGOUT_OPENCODE_COMMAND).toBe('/opt/fake/agent')
  })

  test('resumes with --session and starts with --prompt', () => {
    expect(opencodeAdapter.launch(launchContext({ isResuming: true })).commandLine).toBe(
      '"$DUGOUT_OPENCODE_COMMAND" --session "$DUGOUT_RESUME_SESSION"',
    )
    expect(opencodeAdapter.launch(launchContext({ hasInitialPrompt: true })).commandLine).toBe(
      '"$DUGOUT_OPENCODE_COMMAND" --prompt "$DUGOUT_INITIAL_PROMPT"',
    )
  })

  test('loads the status plugin from app data through inline config', () => {
    const launch = opencodeAdapter.launch(launchContext())
    expect(inlineConfig(launch.env)).toEqual({
      plugin: [pathToFileURL(join('/data', OPENCODE_PLUGIN_FILE)).href],
    })
  })

  test('adds the dugout server as a local MCP server, writing no files', () => {
    const files = memoryFiles()
    const launch = opencodeAdapter.launch(launchContext({ mcp: { server: MCP_ENTRY, files } }))
    expect(inlineConfig(launch.env).mcp).toEqual({
      dugout: {
        type: 'local',
        command: ['/Apps/Dugout', '/out/main/mcp.js'],
        environment: MCP_ENTRY.env,
      },
    })
    expect(files.contents.size).toBe(0)
  })

  test('prepare writes the status plugin', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'dugout-opencode-'))
    await opencodeAdapter.prepare?.(dataDir)
    expect(readFileSync(join(dataDir, OPENCODE_PLUGIN_FILE), 'utf8')).toBe(OPENCODE_STATUS_PLUGIN)
  })
})
