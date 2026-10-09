import { mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { AGENTS } from '@shared/agents'
import type { AgentAdapter } from './AgentAdapter'
import { AGENT_ADAPTERS, agentCommands } from './registry'
import { launchContext, MCP_ENTRY, memoryFiles } from './testContext'

/**
 * Every combination of resuming, a first prompt and the task server that `TerminalManager`
 * asks for (a resumed session never gets the first prompt again).
 */
const CASES = [false, true]
  .flatMap((isResuming) =>
    [false, true].flatMap((hasInitialPrompt) =>
      [false, true].map((hasMcp) => ({ isResuming, hasInitialPrompt, hasMcp })),
    ),
  )
  .filter((flags) => !(flags.isResuming && flags.hasInitialPrompt))

const PLAIN_VARIABLE = /"\$([A-Z][A-Z0-9_]*)"/g

/** The command line with every plain "$VAR" taken out; nothing else may expand. */
function withoutPlainVariables(line: string): string {
  return line.replace(PLAIN_VARIABLE, '')
}

describe.each(Object.entries(AGENT_ADAPTERS))('%s adapter contract', (kind, adapter) => {
  test('is registered under its own kind, with the shared info', () => {
    expect(adapter.info.kind).toBe(kind)
    expect(adapter.info).toBe(AGENTS[adapter.info.kind])
    expect(adapter.defaultCommand).toMatch(/^[\w.-]+$/)
    expect(adapter.commandVariable).toMatch(/^DUGOUT_[A-Z]+_COMMAND$/)
  })

  test('takes its command from its own variable, or runs the default', () => {
    expect(agentCommands({})[adapter.info.kind]).toBe(adapter.defaultCommand)
    const env = { [adapter.commandVariable]: '/opt/fake' }
    expect(agentCommands(env)[adapter.info.kind]).toBe('/opt/fake')
  })

  test.each(CASES)('launch line is plain "$VAR"s it provides (%o)', (flags) => {
    const files = memoryFiles()
    const context = launchContext({
      isResuming: flags.isResuming,
      hasInitialPrompt: flags.hasInitialPrompt,
      ...(flags.hasMcp && { mcp: { server: MCP_ENTRY, files } }),
    })
    const launch = adapter.launch(context)
    const shared = new Set([
      ...(flags.isResuming ? ['DUGOUT_RESUME_SESSION'] : []),
      ...(flags.hasInitialPrompt ? ['DUGOUT_INITIAL_PROMPT'] : []),
    ])

    expect(launch.commandLine.startsWith(`"$${adapter.commandVariable}"`)).toBe(true)
    expect(launch.env[adapter.commandVariable]).toBe(context.command)
    expect(withoutPlainVariables(launch.commandLine)).not.toMatch(/[$`\\]/)
    const used = [...launch.commandLine.matchAll(PLAIN_VARIABLE)].map((match) => match[1] ?? '')
    for (const variable of used) {
      expect(variable in launch.env || shared.has(variable), variable).toBe(true)
    }
    expect(used.includes('DUGOUT_RESUME_SESSION')).toBe(flags.isResuming)
    expect(used.includes('DUGOUT_INITIAL_PROMPT')).toBe(flags.hasInitialPrompt)
  })

  test('gives the agent the dugout server when it has MCP, and cleans up on dispose', () => {
    const files = memoryFiles()
    const launch = adapter.launch(launchContext({ mcp: { server: MCP_ENTRY, files } }))
    const everything = [...Object.values(launch.env), ...files.contents.values()].join('\n')

    expect(everything.includes(MCP_ENTRY.args[0] ?? '')).toBe(adapter.info.capabilities.hasMcp)
    launch.dispose?.()
    expect(files.contents.size).toBe(0)
  })

  test('has a headless run exactly when it says it can, as plain "$VAR"s', () => {
    expect(adapter.headless !== undefined).toBe(adapter.info.capabilities.canRunHeadless)
    const headless = adapter.headless?.('/opt/fake')
    if (!headless) return
    expect(headless.commandLine.startsWith(`"$${adapter.commandVariable}"`)).toBe(true)
    expect(headless.commandLine).toContain('"$DUGOUT_HEADLESS_PROMPT"')
    expect(headless.env[adapter.commandVariable]).toBe('/opt/fake')
    expect(withoutPlainVariables(headless.commandLine)).not.toMatch(/[$`\\]/)
  })
})

const WRITE_TOOLS = ['create_task', 'create_tasks', 'update_task', 'comment_on_task']

/** Everything an adapter hands its agent: prepared files, launch env and per-terminal files. */
async function everythingWritten(adapter: AgentAdapter): Promise<string> {
  const dataDir = mkdtempSync(join(tmpdir(), 'dugout-contract-'))
  await adapter.prepare?.(dataDir)
  const prepared = readdirSync(dataDir).map((name) => readFileSync(join(dataDir, name), 'utf8'))
  const files = memoryFiles()
  const launch = adapter.launch(launchContext({ dataDir, mcp: { server: MCP_ENTRY, files } }))
  return [...prepared, ...Object.values(launch.env), ...files.contents.values()].join('\n')
}

describe.each(Object.entries(AGENT_ADAPTERS))('%s adapter permissions', (_kind, adapter) => {
  test('never pre-approves the whole dugout server or a task write (decision 053)', async () => {
    const written = await everythingWritten(adapter)
    expect(written).not.toContain('"mcp__dugout"')
    for (const tool of WRITE_TOOLS) {
      expect(written).not.toContain(`mcp__dugout__${tool}`)
      expect(written).not.toContain(`"dugout_${tool}":"allow"`)
    }
  })
})

describe.each(Object.entries(AGENT_ADAPTERS))('%s adapter usage', (_kind, adapter) => {
  test('reads usage exactly when it says it has usage', () => {
    expect(adapter.usage !== undefined).toBe(adapter.info.capabilities.hasUsage)
  })

  test.runIf(adapter.usage)('keeps transcripts under the home folder, or its own variable', () => {
    const usage = adapter.usage
    if (!usage) return
    expect(usage.transcriptRoot('/Users/me', {}).startsWith('/Users/me/')).toBe(true)
    const root = usage.transcriptRoot('/Users/me', { CLAUDE_CONFIG_DIR: '/c', CODEX_HOME: '/x' })
    expect(['/c', '/x']).toContain(root)
  })

  test.runIf(adapter.usage)('finds nothing in lines it does not understand', () => {
    const usage = adapter.usage?.read(['', 'not json', '{"type":"unknown"}'], {}, '/f.jsonl')
    expect(usage?.observations).toEqual([])
    expect(usage?.context).toBeNull()
  })
})

describe.each(Object.entries(AGENT_ADAPTERS))('%s adapter timeline', (_kind, adapter) => {
  test('reads timelines exactly when it says it has them, from its usage folder', () => {
    expect(adapter.timeline !== undefined).toBe(adapter.info.capabilities.hasTimeline)
    if (adapter.timeline) expect(adapter.usage).toBeDefined()
  })

  test.runIf(adapter.timeline)('finds no steps in lines it does not understand', () => {
    expect(adapter.timeline?.read(['', 'not json', '{"type":"unknown"}'])).toEqual([])
  })

  test.runIf(adapter.timeline)('never looks up a session id that is not a plain id', async () => {
    expect(await adapter.timeline?.find('/nonexistent', '../../etc/passwd')).toBeNull()
  })
})
