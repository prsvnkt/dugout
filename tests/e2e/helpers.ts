import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'

interface TestWindow {
  readonly dugout: DugoutApi
  terminalOutput: string[]
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
    testWindow.dugout.terminal.onData((_id, data) => testWindow.terminalOutput.push(data))
  })
  return () => page.evaluate(() => (globalThis as unknown as TestWindow).terminalOutput.join(''))
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
 * prompt | ask | tool | notify-idle | stop | stop-later
 */
const FAKE_CLAUDE_SOURCE = String.raw`
const { readFileSync } = require('node:fs')
const { spawnSync } = require('node:child_process')
const settingsPath = process.argv[process.argv.indexOf('--settings') + 1]
const { hooks } = JSON.parse(readFileSync(settingsPath, 'utf8'))

function fire(event, matchValue) {
  for (const group of hooks[event] ?? []) {
    if (group.matcher && !group.matcher.split('|').includes(matchValue)) continue
    for (const hook of group.hooks) {
      const input = JSON.stringify({ hook_event_name: event, session_id: 'fake' })
      spawnSync('bash', ['-c', hook.command], { input, stdio: ['pipe', 'ignore', 'ignore'] })
    }
  }
}

const actions = {
  prompt: () => fire('UserPromptSubmit'),
  ask: () => fire('PermissionRequest'),
  tool: () => fire('PostToolUse', 'Bash'),
  'notify-idle': () => fire('Notification', 'idle_prompt'),
  stop: () => fire('Stop'),
  'stop-later': () => setTimeout(() => fire('Stop'), 2500),
}

fire('SessionStart', 'startup')
process.stdout.write('fake-claude ready\r\n')
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  for (const line of chunk.split(/\r?\n|\r/)) actions[line.trim()]?.()
})
`

export function makeFakeClaude(): string {
  const path = join(makeTempDir('dugout-fake-claude-'), 'claude')
  writeFileSync(path, `#!${process.execPath}\n${FAKE_CLAUDE_SOURCE}`, { mode: 0o755 })
  return path
}
