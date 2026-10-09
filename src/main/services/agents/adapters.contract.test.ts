import { describe, expect, test } from 'vitest'
import { AGENTS } from '@shared/agents'
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
})
