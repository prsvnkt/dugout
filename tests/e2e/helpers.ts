import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
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
  return electron.launch({
    args: ['.'],
    env: { ...process.env, DUGOUT_USER_DATA_DIR: userDataDir, ...extraEnv },
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
 * A stand-in for the `claude` CLI that runs the hook commands from the `--settings` file
 * exactly as Claude Code would, driven by lines typed into the terminal:
 * prompt | ask | tool | notify-idle | stop | stop-later | exit
 * It resumes the session passed with --resume, or starts a new one, and prints which.
 */
const FAKE_CLAUDE_SOURCE = String.raw`
const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
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
  'agent-comment': () =>
    void callDugoutTool('comment_on_task', { number: 1, body: 'Progress from the agent' }),
}

fire('SessionStart', 'startup')
process.stdout.write('fake-claude ready resume=' + (resumed ?? 'none') + ' session=' + sessionId + '\r\n')
if (firstPrompt) process.stdout.write('prompt=' + firstPrompt.split('\n')[0] + '\r\n')

/** Acts like an agent using a Dugout task tool: starts the MCP server from --mcp-config. */
async function callDugoutTool(name, args) {
  const sdk = (path) => require(PROJECT_ROOT + '/node_modules/@modelcontextprotocol/sdk/dist/cjs/' + path)
  const { Client } = sdk('client/index.js')
  const { StdioClientTransport } = sdk('client/stdio.js')
  const { mcpServers } = JSON.parse(readFileSync(argValue('--mcp-config'), 'utf8'))
  const server = mcpServers.dugout
  const client = new Client({ name: 'fake-claude', version: '1' })
  await client.connect(new StdioClientTransport({ command: server.command, args: server.args, env: { ...process.env, ...server.env } }))
  const result = await client.callTool({ name, arguments: args })
  process.stdout.write('tool-result=' + JSON.stringify(result.content[0].text).slice(0, 200) + '\r\n')
  await client.close()
}
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  for (const line of chunk.split(/\r?\n|\r/)) actions[line.trim()]?.()
})
`

export function makeFakeClaude(): string {
  const path = join(makeTempDir('dugout-fake-claude-'), 'claude')
  const header = `#!${process.execPath}\nconst PROJECT_ROOT = ${JSON.stringify(process.cwd())}\n`
  writeFileSync(path, header + FAKE_CLAUDE_SOURCE, { mode: 0o755 })
  return path
}

/** Opens the folder-picker flow from the "+" next to the project tabs. */
export async function openAddProjectFromTabs(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('menuitem', { name: /^Add project…/ }).click()
}
