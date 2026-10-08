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
 * How the fake `claude` reads its arguments: hooks from the `--settings` file, the MCP server from
 * `--mcp-config`, the session from `--resume`.
 */
const CLAUDE_ARGS_SOURCE = String.raw`
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
`

/**
 * How the fake `codex` reads its arguments: `codex [prompt] -c key=value…` or
 * `codex resume <id> -c key=value…`, with hooks and MCP servers as TOML config overrides.
 */
const CODEX_ARGS_SOURCE = String.raw`
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
`

/**
 * A stand-in for an agent CLI that runs Dugout's hook commands exactly as the real one would,
 * driven by lines typed into the terminal:
 * prompt | ask | tool | notify-idle | stop | stop-later | exit | agent-comment | edit | raw-keys
 * (`raw-keys` puts the TTY in raw mode and prints every later input chunk as `keys=<json>`.)
 * It resumes the session it was asked to, or starts a new one, and prints which.
 */
const FAKE_AGENT_SOURCE = String.raw`
const sessionId = resumed ?? 'fake-session-' + process.pid

function fire(event, matchValue, extra = {}) {
  for (const group of hooks[event] ?? []) {
    if (group.matcher && !group.matcher.split('|').includes(matchValue)) continue
    for (const hook of group.hooks) {
      const input = JSON.stringify({ hook_event_name: event, session_id: sessionId, ...extra })
      spawnSync('bash', ['-c', hook.command], { input, stdio: ['pipe', 'ignore', 'ignore'] })
    }
  }
}

const actions = {
  prompt: () => fire('UserPromptSubmit'),
  ask: () => fire('PermissionRequest', undefined, { tool_name: 'Bash', tool_input: { command: 'npm install' } }),
  tool: () => fire('PostToolUse', 'Bash'),
  'notify-idle': () => fire('Notification', 'idle_prompt'),
  stop: () => fire('Stop', undefined, { last_assistant_message: 'Fixed the login bug.' }),
  'stop-later': () =>
    setTimeout(() => fire('Stop', undefined, { last_assistant_message: 'Fixed the login bug.' }), 2500),
  exit: () => process.exit(0),
  'raw-keys': () => {
    process.stdin.setRawMode(true)
    isRawKeys = true
    process.stdout.write('raw-keys on\r\n')
  },
  'agent-comment': () =>
    void callDugoutTool('comment_on_task', { number: 1, body: 'Progress from the agent' }),
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
  for (const line of chunk.split(/\r?\n|\r/)) actions[line.trim()]?.()
})
`

function writeFakeAgent(name: 'claude' | 'codex', argsSource: string): string {
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
  await scope.getByRole('menuitem', { name: action }).click()
}
