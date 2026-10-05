import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
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

export async function launchApp(userDataDir: string): Promise<ElectronApplication> {
  return electron.launch({
    args: ['.'],
    env: { ...process.env, DUGOUT_USER_DATA_DIR: userDataDir },
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
