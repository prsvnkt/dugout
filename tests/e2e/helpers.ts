import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  _electron as electron,
  expect,
  type ElectronApplication,
  type Locator,
  type Page,
} from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'

interface TestWindow {
  readonly dugout: DugoutApi
  terminalOutput: string[]
  terminalIds: string[]
}

export function makeTempDir(prefix = 'dugout-e2e-'): string {
  return realpathSync(mkdtempSync(join(tmpdir(), prefix)))
}

export function makeGitRepo(name: string): string {
  const repo = join(makeTempDir(), name)
  mkdirSync(repo)
  execFileSync('git', ['init', '-q'], { cwd: repo })
  return repo
}

export async function launchApp(
  userDataDir: string,
  extraEnv: Record<string, string> = {},
): Promise<ElectronApplication> {
  // DUGOUT_E2E_EXECUTABLE runs the suite against a packaged app (`npm run test:e2e:packaged`).
  const packagedApp = process.env.DUGOUT_E2E_EXECUTABLE
  return electron.launch({
    ...(packagedApp ? { executablePath: packagedApp, args: [] } : { args: ['.'] }),
    env: {
      ...process.env,
      DUGOUT_USER_DATA_DIR: userDataDir,
      // The welcome screen searches the home folder for repos; never the real one in tests.
      DUGOUT_HOME_DIR: makeTempDir('dugout-home-'),
      ...extraEnv,
    },
  })
}

/** Playwright cannot drive native dialogs, so make the folder picker return `path`. */
export async function stubFolderPicker(app: ElectronApplication, path: string): Promise<void> {
  await app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] })
  }, path)
}

/** xterm renders to a canvas, so collect terminal output from the bridge instead. */
export async function recordTerminalOutput(page: Page): Promise<() => Promise<string>> {
  await page.evaluate(() => {
    const testWindow = globalThis as unknown as TestWindow
    testWindow.terminalOutput = []
    testWindow.terminalIds = []
    testWindow.dugout.terminal.onData((id, data) => {
      testWindow.terminalOutput.push(data)
      if (!testWindow.terminalIds.includes(id)) testWindow.terminalIds.push(id)
    })
  })
  return () => page.evaluate(() => (globalThis as unknown as TestWindow).terminalOutput.join(''))
}

/** Terminal ids in the order they first produced output (needs `recordTerminalOutput`). */
export function terminalIdsSeen(page: Page): Promise<string[]> {
  return page.evaluate(() => (globalThis as unknown as TestWindow).terminalIds)
}

/** Clicks a native menu item, which is what its keyboard shortcut triggers. */
export async function clickMenuItem(
  app: ElectronApplication,
  menuLabel: string,
  itemLabel: string,
): Promise<void> {
  await app.evaluate(
    ({ Menu }, labels) => {
      const menu = Menu.getApplicationMenu()?.items.find((item) => item.label === labels.menu)
      const item = menu?.submenu?.items.find((entry) => entry.label === labels.item)
      if (!item) throw new Error(`Menu item not found: ${labels.menu} > ${labels.item}`)
      item.click()
    },
    { menu: menuLabel, item: itemLabel },
  )
}

/**
 * Claude Code and Codex run the hook commands from their config for each event, with the path of
 * the session's transcript, as the real ones do.
 */
const RUN_HOOK_COMMANDS = String.raw`
function fire(event, matchValue, extra = {}) {
  for (const group of hooks[event] ?? []) {
    if (group.matcher && !group.matcher.split('|').includes(matchValue)) continue
    for (const hook of group.hooks) {
      const transcript = transcriptPath()
      const input = JSON.stringify({
        hook_event_name: event,
        session_id: sessionId,
        ...(transcript && { transcript_path: transcript }),
        ...extra,
      })
      spawnSync('bash', ['-c', hook.command], { input, stdio: ['pipe', 'ignore', 'ignore'] })
    }
  }
}
`

/**
 * How the fake `claude` reads its arguments: hooks from the `--settings` file, the MCP server from
 * `--mcp-config`, the session from `--resume`. `claude -p <prompt>` (headless, e.g. to build a
 * codemap) prints a canned answer and exits.
 */
const CLAUDE_ARGS_SOURCE =
  String.raw`
if (process.argv[2] === '-p') {
  process.stdout.write('# Codemap\n\n- src/: the fake app (asked: ' + process.argv[3].split(' ')[0] + ')\n')
  process.exit(0)
}
const argValue = (flag) => {
  const index = process.argv.indexOf(flag)
  return index === -1 ? undefined : process.argv[index + 1]
}
// The first prompt is the first argument that is neither an option nor an option's value.
const VALUE_FLAGS = new Set(['--settings', '--resume', '--mcp-config'])
const firstPrompt = process.argv
  .slice(2)
  .find((arg, i, args) => !arg.startsWith('--') && !VALUE_FLAGS.has(args[i - 1]))
const { hooks } = JSON.parse(readFileSync(argValue('--settings'), 'utf8'))
const resumed = argValue('--resume')
const dugoutServer = () => JSON.parse(readFileSync(argValue('--mcp-config'), 'utf8')).mcpServers.dugout

// A transcript like Claude Code's, under $CLAUDE_CONFIG_DIR (the tests' stand-in for ~/.claude).
const transcriptPath = () =>
  process.env.CLAUDE_CONFIG_DIR &&
  require('node:path').join(process.env.CLAUDE_CONFIG_DIR, 'projects', 'fake', sessionId + '.jsonl')
let replyCount = 0
function writeUsage(input, output) {
  const path = transcriptPath()
  require('node:fs').mkdirSync(require('node:path').dirname(path), { recursive: true })
  const message = {
    id: 'msg_' + process.pid + '_' + ++replyCount,
    model: 'claude-opus-5-5',
    usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  }
  const line = { type: 'assistant', isSidechain: false, timestamp: new Date().toISOString(), sessionId, message }
  // Streamed replies repeat their line; Dugout must count it once.
  require('node:fs').appendFileSync(path, (JSON.stringify(line) + '\n').repeat(2))
}
` + RUN_HOOK_COMMANDS

/**
 * How the fake `codex` reads its arguments: `codex [prompt] -c key=value…` or
 * `codex resume <id> -c key=value…`, with hooks and MCP servers as TOML config overrides.
 */
const CODEX_ARGS_SOURCE =
  String.raw`
const { parse } = require(PROJECT_ROOT + '/node_modules/smol-toml/dist/index.cjs')
const args = process.argv.slice(2)
const overrides = {}
const positional = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-c') {
    const [key, ...rest] = args[++i].split('=')
    overrides[key] = parse('v = ' + rest.join('=')).v
  } else positional.push(args[i])
}
const resumed = positional[0] === 'resume' ? positional[1] : undefined
const firstPrompt = resumed ? undefined : positional[0]
const hooks = Object.fromEntries(
  Object.entries(overrides)
    .filter(([key]) => key.startsWith('hooks.'))
    .map(([key, value]) => [key.slice('hooks.'.length), value]),
)
const dugoutServer = () => overrides['mcp_servers.dugout']
const mcpNames = Object.keys(overrides).filter((key) => key.startsWith('mcp_servers.'))
process.stdout.write('mcp=' + mcpNames.map((key) => key.slice('mcp_servers.'.length)).join(',') + '\r\n')

// A session log like Codex's, under $CODEX_HOME (the tests' stand-in for ~/.codex).
const transcriptPath = () =>
  process.env.CODEX_HOME &&
  require('node:path').join(process.env.CODEX_HOME, 'sessions', 'rollout-' + sessionId + '.jsonl')
const totals = { input_tokens: 0, output_tokens: 0 }
function writeUsage(input, output) {
  const path = transcriptPath()
  const fs = require('node:fs')
  const at = new Date().toISOString()
  const lines = []
  if (!fs.existsSync(path)) {
    fs.mkdirSync(require('node:path').dirname(path), { recursive: true })
    lines.push({ timestamp: at, type: 'session_meta', payload: { id: sessionId } })
    lines.push({ timestamp: at, type: 'turn_context', payload: { model: 'gpt-6-astra' } })
  }
  totals.input_tokens += input
  totals.output_tokens += output
  const info = {
    total_token_usage: { ...totals },
    last_token_usage: { input_tokens: input, output_tokens: output },
    model_context_window: 258400,
  }
  lines.push({ timestamp: at, type: 'event_msg', payload: { type: 'token_count', info } })
  fs.appendFileSync(path, lines.map((line) => JSON.stringify(line) + '\n').join(''))
}
` + RUN_HOOK_COMMANDS

/**
 * How the fake `opencode` reads its arguments (`--session <id>`, `--prompt <text>`) and its inline
 * config, then loads Dugout's status plugin the way OpenCode does. Each Claude Code hook event
 * the fake fires becomes the OpenCode event or plugin hook that means the same thing.
 */
const OPENCODE_ARGS_SOURCE = String.raw`
const args = process.argv.slice(2)
const argValue = (flag) => {
  const index = args.indexOf(flag)
  return index === -1 ? undefined : args[index + 1]
}
const resumed = argValue('--session')
const firstPrompt = argValue('--prompt')
const config = JSON.parse(process.env.OPENCODE_CONFIG_CONTENT ?? '{}')
const dugoutServer = () => {
  const { command, environment } = config.mcp.dugout
  return { command: command[0], args: command.slice(1), env: environment }
}
process.stdout.write('mcp=' + Object.keys(config.mcp ?? {}).join(',') + '\r\n')
// OpenCode has no usage reader in Dugout yet.
const transcriptPath = () => undefined
const writeUsage = () => {}

// OpenCode runs on Bun, whose fetch can POST to a Unix socket; Node's cannot, so stand in for it.
globalThis.fetch = (url, init = {}) =>
  new Promise((resolve, reject) => {
    const request = require('node:http').request(
      { socketPath: init.unix, path: new URL(url).pathname, method: init.method, headers: init.headers },
      (response) => response.resume().on('end', () => resolve({ status: response.statusCode })),
    )
    request.on('error', reject)
    request.end(init.body)
  })
const plugins = Promise.all(
  (config.plugin ?? []).map(async (spec) =>
    Promise.all(Object.values(await import(spec)).map((plugin) => plugin({}))),
  ),
).then((lists) => lists.flat())
const callHook = (name, ...input) =>
  plugins.then((list) => Promise.all(list.map((hooks) => hooks[name]?.(...input))))
const emit = (type, properties) => callHook('event', { event: { type, properties } })

let requestCount = 0
function fire(event, matchValue, extra = {}) {
  const sessionID = sessionId
  switch (event) {
    case 'UserPromptSubmit':
      return void emit('session.status', { sessionID, status: { type: 'busy' } })
    case 'PermissionRequest':
      return void emit('permission.asked', {
        id: 'per_' + ++requestCount,
        sessionID,
        permission: extra.tool_name.toLowerCase(),
        patterns: [],
        metadata: extra.tool_input,
      })
    case 'PostToolUse':
      return void callHook(
        'tool.execute.after',
        { tool: extra.tool_name.toLowerCase(), sessionID, callID: extra.tool_use_id, args: extra.tool_input },
        { title: '', output: '', metadata: {} },
      )
    case 'Stop':
      return void emit('session.status', { sessionID, status: { type: 'idle' } })
  }
}
`

/**
 * A stand-in for an agent CLI that runs Dugout's hook commands exactly as the real one would,
 * driven by lines typed into the terminal:
 * prompt | ask [command…] | ask-edit [file] | tool [command…] | notify-idle | stop | stop-later |
 * exit | agent-comment | agent-note | agent-context | edit | raw-keys | subagent-start <id> <type> |
 * subagent-stop <id> <type> | usage <input> <output> (writes a reply with that usage to the
 * transcript, then stops)
 * (`ask` requests approval for a Bash command, `npm install` by default; like the real CLIs it
 * sends no tool id. `tool` finishes a Bash call with a fresh tool id, as PostToolUse does.)
 * (`raw-keys` puts the TTY in raw mode and prints every later input chunk as `keys=<json>`.)
 * It resumes the session it was asked to, or starts a new one, and prints which.
 */
const FAKE_AGENT_SOURCE = String.raw`
const sessionId = resumed ?? 'fake-session-' + process.pid
let toolCount = 0
const bash = (words) => ({ command: words.length > 0 ? words.join(' ') : 'npm install' })


const actions = {
  prompt: () => fire('UserPromptSubmit'),
  ask: (...words) => fire('PermissionRequest', 'Bash', { tool_name: 'Bash', tool_input: bash(words) }),
  'ask-edit': (file = 'src/login.ts') =>
    fire('PermissionRequest', 'Edit', {
      tool_name: 'Edit',
      tool_input: { file_path: file, old_string: 'const timeout = 1000', new_string: 'const timeout = 5000' },
    }),
  tool: (...words) =>
    fire('PostToolUse', 'Bash', {
      tool_name: 'Bash',
      tool_use_id: 'toolu_fake_' + ++toolCount,
      tool_input: bash(words),
      tool_response: { stdout: 'ok' },
    }),
  'notify-idle': () => fire('Notification', 'idle_prompt'),
  stop: () => fire('Stop', undefined, { last_assistant_message: 'Fixed the login bug.' }),
  // A reply that used tokens, written to the transcript, then the turn ends.
  usage: (input = '1000', output = '100') => {
    writeUsage(Number(input), Number(output))
    fire('Stop', undefined, { last_assistant_message: 'Used some tokens.' })
  },
  'stop-later': () =>
    setTimeout(() => fire('Stop', undefined, { last_assistant_message: 'Fixed the login bug.' }), 2500),
  exit: () => process.exit(0),
  'subagent-start': (id, type) =>
    fire('SubagentStart', type, { agent_id: id, agent_type: type }),
  'subagent-stop': (id, type) =>
    fire('SubagentStop', type, {
      agent_id: id,
      agent_type: type,
      last_assistant_message: 'Report from ' + id,
    }),
  'raw-keys': () => {
    process.stdin.setRawMode(true)
    isRawKeys = true
    process.stdout.write('raw-keys on\r\n')
  },
  'agent-comment': () =>
    void callDugoutTool('comment_on_task', { number: 1, body: 'Progress from the agent' }),
  'agent-note': () =>
    void callDugoutTool('add_note', { title: 'Tests need Docker', body: 'Start Docker before npm test.' }),
  'agent-context': () => void callDugoutTool('list_context', {}),
  // Leaves changes in the working directory: one file of its own and one both agents edit.
  edit: () => {
    writeFileSync(AGENT_NAME + '.txt', 'by ' + AGENT_NAME + '\n')
    writeFileSync('shared.txt', 'shared by ' + AGENT_NAME + '\n')
    process.stdout.write('edited\r\n')
  },
}

fire('SessionStart', 'startup')
process.stdout.write(AGENT_NAME + ' ready resume=' + (resumed ?? 'none') + ' session=' + sessionId + '\r\n')
if (firstPrompt) process.stdout.write('prompt=' + firstPrompt.split('\n')[0] + '\r\n')

/** Acts like an agent using a Dugout task tool: starts the "dugout" MCP server it was given. */
async function callDugoutTool(name, args) {
  const sdk = (path) => require(PROJECT_ROOT + '/node_modules/@modelcontextprotocol/sdk/dist/cjs/' + path)
  const { Client } = sdk('client/index.js')
  const { StdioClientTransport } = sdk('client/stdio.js')
  const server = dugoutServer()
  const client = new Client({ name: AGENT_NAME, version: '1' })
  await client.connect(new StdioClientTransport({ command: server.command, args: server.args, env: { ...process.env, ...server.env } }))
  const result = await client.callTool({ name, arguments: args })
  process.stdout.write('tool-result=' + JSON.stringify(result.content[0].text).slice(0, 200) + '\r\n')
  await client.close()
}
let isRawKeys = false
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  if (isRawKeys) return void process.stdout.write('keys=' + JSON.stringify(chunk) + '\r\n')
  for (const line of chunk.split(/\r?\n|\r/)) {
    const [name, ...args] = line.trim().split(/\s+/)
    actions[name]?.(...args)
  }
})
`

function writeFakeAgent(name: 'claude' | 'codex' | 'opencode', argsSource: string): string {
  const path = join(makeTempDir(`dugout-fake-${name}-`), name)
  const header = [
    `#!${process.execPath}`,
    `const PROJECT_ROOT = ${JSON.stringify(process.cwd())}`,
    `const AGENT_NAME = 'fake-${name}'`,
    `const { readFileSync, writeFileSync } = require('node:fs')`,
    `const { spawnSync } = require('node:child_process')`,
  ].join('\n')
  writeFileSync(path, header + argsSource + FAKE_AGENT_SOURCE, { mode: 0o755 })
  return path
}

export function makeFakeClaude(): string {
  return writeFakeAgent('claude', CLAUDE_ARGS_SOURCE)
}

export function makeFakeCodex(): string {
  return writeFakeAgent('codex', CODEX_ARGS_SOURCE)
}

/** A fake `opencode` (for `DUGOUT_OPENCODE_COMMAND`) that runs Dugout's real status plugin. */
export function makeFakeOpenCode(): string {
  return writeFakeAgent('opencode', OPENCODE_ARGS_SOURCE)
}

/**
 * Starts adding a project (stub the folder picker first): from the welcome screen when there are
 * no projects, otherwise from the "+" next to the tabs. The folder is added straight away.
 */
export async function openAddProject(page: Page): Promise<void> {
  const welcomeButton = page.getByRole('button', { name: 'Add project…' })
  const newProject = page.getByRole('button', { name: 'New project' })
  // Projects load after launch: wait until one of the two entry points shows.
  await expect(welcomeButton.or(newProject)).toBeVisible()
  if (await welcomeButton.isVisible()) await welcomeButton.click()
  else await openAddProjectFromTabs(page)
}

/** Adds `repo` as a project through the folder picker and waits for its tab. */
export async function addProjectFolder(
  app: ElectronApplication,
  page: Page,
  repo: string,
): Promise<void> {
  await stubFolderPicker(app, repo)
  await openAddProject(page)
  const name = basename(repo)
  await expect(
    page.getByRole('navigation').getByRole('button', { name, exact: true }),
  ).toBeVisible()
}

/** Opens the folder-picker flow from the "+" next to the project tabs. */
export async function openAddProjectFromTabs(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('menuitem', { name: /^Add project…/ }).click()
}

/** Picks an action (e.g. "New shell") from the activity rail's "+" menu. */
export async function chooseNewAgentAction(scope: Page | Locator, action: string): Promise<void> {
  await scope.getByRole('button', { name: 'New agent' }).click()
  await scope.getByRole('menuitem', { name: action, exact: true }).click()
}
