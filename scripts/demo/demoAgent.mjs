#!/usr/bin/env node
/**
 * A scripted stand-in for `claude` or `codex`, used only to record the README demo
 * (`npm run demo:gif`). It reads Dugout's hooks the way the real CLI does, fires them as it
 * plays the script for its project (see agentScripts.mjs), and really edits the project's files
 * so the git panel has something to show.
 *
 * Usage: demoAgent.mjs <claude|codex> [agent CLI arguments…]
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { parse as parseToml } from 'smol-toml'
import { AGENT_SCRIPTS } from './agentScripts.mjs'

const TYPING_DELAY_MS = 12
const [kind, ...args] = process.argv.slice(2)

/** Hooks from `--settings` (claude) or `-c hooks.<event>=…` overrides (codex), and the prompt. */
function readLaunch() {
  if (kind === 'claude') {
    const settings = args[args.indexOf('--settings') + 1]
    const prompt = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--settings')
    return { hooks: JSON.parse(readFileSync(settings, 'utf8')).hooks, prompt }
  }
  const hooks = {}
  const positional = []
  for (let i = 0; i < args.length; i++) {
    if (args[i] !== '-c') {
      positional.push(args[i])
      continue
    }
    const [key, ...rest] = args[++i].split('=')
    if (key.startsWith('hooks.'))
      hooks[key.slice('hooks.'.length)] = parseToml(`v = ${rest.join('=')}`).v
  }
  return { hooks, prompt: positional[0] }
}

const { hooks, prompt } = readLaunch()
const sessionId = `demo-${kind}-${process.pid}`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const write = (text) => process.stdout.write(text.replaceAll('\n', '\r\n'))

function fire(event, extra = {}) {
  for (const group of hooks[event] ?? []) {
    for (const hook of group.hooks) {
      const input = JSON.stringify({ hook_event_name: event, session_id: sessionId, ...extra })
      spawnSync('bash', ['-c', hook.command], { input, stdio: ['pipe', 'ignore', 'ignore'] })
    }
  }
}

/** Resolves with the next line typed into the terminal. */
function nextLine() {
  return new Promise((resolve) =>
    process.stdin.once('data', (chunk) => resolve(String(chunk).trim())),
  )
}

async function type(text) {
  for (const char of text) {
    write(char)
    await sleep(TYPING_DELAY_MS)
  }
  write('\n')
}

const STEPS = {
  say: (text) => type(text),
  print: async (text) => write(`${text}\n`),
  pause: (ms) => sleep(ms),
  write: async (path, content) => {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  },
  ask: async (question) => {
    write(`\n\x1b[1;33m? ${question}\x1b[0m \x1b[2m(y/n)\x1b[0m `)
    fire('PermissionRequest', { tool_name: 'Bash', tool_input: { command: question } })
    await nextLine()
    fire('PostToolUse')
  },
  stop: async (summary) => {
    write(`\n\x1b[1;32m✓\x1b[0m ${summary}\n\n\x1b[2m›\x1b[0m `)
    fire('Stop', { last_assistant_message: summary })
  },
}

async function run() {
  process.stdin.setEncoding('utf8')
  fire('SessionStart')
  const script = AGENT_SCRIPTS[`${basename(process.cwd())}:${kind}`]
  write(`\x1b[2m${kind} · demo session\x1b[0m\n\n`)
  // With no prompt on the command line, wait for one typed into the terminal (the tty echoes it).
  if (prompt) write(`\x1b[2m›\x1b[0m \x1b[1m${prompt}\x1b[0m\n`)
  else {
    write('\x1b[2m›\x1b[0m ')
    await nextLine()
  }
  write('\n')
  fire('UserPromptSubmit')
  for (const [step, ...stepArgs] of script ?? [['stop', 'Nothing scripted for this project.']]) {
    await STEPS[step](...stepArgs)
  }
  // Stay open like a real agent waiting for the next prompt.
  process.stdin.resume()
}

void run()
