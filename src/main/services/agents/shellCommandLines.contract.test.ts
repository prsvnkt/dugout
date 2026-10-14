import { describe, expect, test } from 'vitest'
import { HOOK_SIGNALS, SUBAGENT_SIGNALS } from '@shared/agentStatus'
import { buildHookSettings, signalCommand } from '../agentHooks/hookSettings'
import { SETUP_COMMAND_LINE } from '../terminal/TerminalManager'
import { LOOKUP_COMMAND } from '../welcome/checkAgentClis'
import { AGENT_ADAPTERS } from './registry'
import { launchContext, MCP_ENTRY, memoryFiles } from './testContext.testSupport'

/*
 * Decision 013: every shell command line Dugout writes expands variables only as plain "$VAR",
 * because `${VAR:+…}`, `$(…)` and backticks behave differently (or not at all) in zsh, bash and
 * fish. Values travel in environment variables, never spliced into the line.
 */

const PLAIN_VARIABLE = /"\$[A-Z_][A-Z0-9_]*"/g
const DOUBLE_QUOTED = /"[^"\\]*"/g
const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/

function forbiddenForms(line: string): string[] {
  return ['${', '$(', '`'].filter((form) => line.includes(form))
}

/**
 * A line run by the user's own shell (zsh, bash or fish): each `$` is a whole `"$VAR"` word.
 * Returns what is left that could expand, or '' when the line is clean.
 */
function strictViolations(line: string): string {
  const rest = line.replace(PLAIN_VARIABLE, '')
  return /[$`\\]/.test(rest) ? rest : ''
}

/**
 * A hook command (run by the agent CLI with `sh -c`): a plain `$VAR` may sit inside a longer
 * double-quoted word, such as `"Authorization: Bearer $DUGOUT_HOOK_TOKEN"`, but never outside
 * double quotes, and never as a conditional, a command substitution or a lowercase name.
 */
function quotedViolations(line: string): string[] {
  const problems: string[] = []
  for (const [word] of line.matchAll(DOUBLE_QUOTED)) {
    for (const [expansion, name = ''] of word.matchAll(/\$([A-Za-z0-9_]*)/g)) {
      if (!ENV_NAME.test(name)) problems.push(expansion)
    }
  }
  const outside = line.replace(DOUBLE_QUOTED, '')
  if (/[$`\\]/.test(outside)) problems.push(`outside quotes: ${outside}`)
  return problems
}

/** Resume / first-prompt / task-server combinations the terminal manager launches with. */
const LAUNCH_FLAGS = [
  { isResuming: false, hasInitialPrompt: false, hasMcp: false },
  { isResuming: false, hasInitialPrompt: true, hasMcp: true },
  { isResuming: true, hasInitialPrompt: false, hasMcp: true },
  { isResuming: true, hasInitialPrompt: false, hasMcp: false },
]

/** Every command line run in the user's login shell, labelled for the test name. */
function userShellLines(): [string, string][] {
  const lines: [string, string][] = [
    ['welcome agent CLI check', LOOKUP_COMMAND],
    ['worktree setup', SETUP_COMMAND_LINE],
  ]
  for (const [kind, adapter] of Object.entries(AGENT_ADAPTERS)) {
    for (const flags of LAUNCH_FLAGS) {
      const context = launchContext({
        isResuming: flags.isResuming,
        hasInitialPrompt: flags.hasInitialPrompt,
        ...(flags.hasMcp && { mcp: { server: MCP_ENTRY, files: memoryFiles() } }),
      })
      lines.push([`${kind} launch ${JSON.stringify(flags)}`, adapter.launch(context).commandLine])
    }
    const headless = adapter.headless?.('/opt/fake')
    if (headless) lines.push([`${kind} headless`, headless.commandLine])
  }
  return lines
}

/** Every hook command, as Claude's settings carry it and for every signal (Codex uses these). */
function hookCommands(): [string, string][] {
  const fromSettings = Object.entries(buildHookSettings().hooks).flatMap(([event, groups]) =>
    groups.flatMap((group) => group.hooks.map((hook): [string, string] => [event, hook.command])),
  )
  const bySignal = [...HOOK_SIGNALS, ...SUBAGENT_SIGNALS].map((signal): [string, string] => [
    signal,
    signalCommand(signal),
  ])
  return [...fromSettings, ...bySignal]
}

describe('decision 013: plain "$VAR" expansions only', () => {
  test.each(userShellLines())('%s', (_label, line) => {
    expect(forbiddenForms(line)).toEqual([])
    expect(strictViolations(line)).toBe('')
  })

  test.each(hookCommands())('hook command for %s', (_label, command) => {
    expect(forbiddenForms(command)).toEqual([])
    expect(quotedViolations(command)).toEqual([])
  })

  test('covers every adapter and every hook signal', () => {
    const labels = userShellLines().map(([label]) => label)
    for (const kind of Object.keys(AGENT_ADAPTERS)) {
      expect(labels.some((label) => label.startsWith(`${kind} launch`))).toBe(true)
    }
    const signals = hookCommands().map(([label]) => label)
    for (const signal of [...HOOK_SIGNALS, ...SUBAGENT_SIGNALS]) {
      expect(signals).toContain(signal)
    }
  })
})

describe('the decision 013 checks themselves', () => {
  test.each([
    ['conditional', '"$CMD" ${RESUME:+--resume "$RESUME"}'],
    ['command substitution', '"$CMD" "$(cat file)"'],
    ['backticks', '"$CMD" `cat file`'],
    ['unquoted variable', '"$CMD" --resume $RESUME'],
    ['lowercase variable', '"$CMD" "$resume"'],
    ['variable inside a longer word', '"$CMD" "--resume=$RESUME"'],
    ['escape', '"$CMD" \\$HOME'],
  ])('rejects a %s in a user-shell line', (_label, line) => {
    expect(forbiddenForms(line).length > 0 || strictViolations(line) !== '').toBe(true)
  })

  test.each([
    ['unquoted variable', 'curl -H "Bearer x" $URL'],
    ['conditional', 'curl "${URL:-x}"'],
    ['lowercase variable', 'curl "http://x/$id"'],
    ['mixed-case name', 'curl "http://x/$IDx"'],
    ['command substitution', 'curl "$(cat url)"'],
  ])('rejects a %s in a hook command', (_label, command) => {
    expect(forbiddenForms(command).length > 0 || quotedViolations(command).length > 0).toBe(true)
  })

  test('accepts plain variables inside longer double-quoted words in a hook command', () => {
    const command = 'curl -H "Authorization: Bearer $TOKEN" "http://dugout/hooks/$ID/ready"'

    expect(quotedViolations(command)).toEqual([])
  })
})
