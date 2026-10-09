import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
} from './helpers'

let app: ElectronApplication
let page: Page
let userDataDir: string
/** Stand-ins for ~/.claude and ~/.codex, where the fakes write their transcripts. */
let claudeDir: string
let codexDir: string

async function start(): Promise<void> {
  app = await launchApp(userDataDir, {
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_CODEX_COMMAND: makeFakeCodex(),
    CLAUDE_CONFIG_DIR: claudeDir,
    CODEX_HOME: codexDir,
  })
  page = await app.firstWindow()
}

test.beforeEach(async () => {
  userDataDir = makeTempDir()
  claudeDir = makeTempDir('dugout-claude-')
  codexDir = makeTempDir('dugout-codex-')
  await start()
})

test.afterEach(async () => {
  await app.close()
})

const paneHeader = () =>
  page
    .locator('[data-active="true"]')
    .getByRole('region', { name: /terminal$/ })
    .locator('header')

async function send(line: string, pane = 0): Promise<void> {
  await page.locator('[data-active="true"] [data-testid="terminal"]').nth(pane).click()
  await page.keyboard.type(`${line}\n`)
}

test('agent headers show live tokens and context use, from hook events', async () => {
  // Arrange
  await addProjectFolder(app, page, makeGitRepo('alpha'))
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(paneHeader()).toContainText('Ready')

  // Act: a reply with 300k input and 2k output tokens (its line is written twice, as streamed)
  await send('usage 300000 2000')

  // Assert: counted once; Claude Opus 5.5 has a 1M window
  const usage = paneHeader().getByTestId('agent-usage')
  await expect(usage).toContainText('302k tok')
  await expect(usage).toContainText('30% ctx')

  // Act: a Codex agent reports its running total the same way
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect(paneHeader().nth(1)).toContainText('Ready')
  await send('usage 50000 1000', 1)
  await expect(paneHeader().nth(1).getByTestId('agent-usage')).toContainText('51.0k tok')
  await expect(paneHeader().nth(1).getByTestId('agent-usage')).toContainText('19% ctx')
})

test('totals survive a restart and the transcripts being deleted', async () => {
  // Arrange: usage from one agent, then quit and delete every transcript
  await addProjectFolder(app, page, makeGitRepo('alpha'))
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(paneHeader()).toContainText('Ready')
  await send('usage 4000 1000')
  await expect(paneHeader().getByTestId('agent-usage')).toContainText('5.0k tok')
  await app.close()
  rmSync(join(claudeDir, 'projects'), { recursive: true, force: true })

  // Act
  await start()
  const tab = page.getByRole('navigation').getByRole('button', { name: 'alpha', exact: true })
  await expect(tab).toBeVisible()
  await clickMenuItem(app, 'View', 'Token Usage')

  // Assert: the Usage view and the project tab's tooltip still have them
  const view = page.getByRole('region', { name: 'Token usage' })
  await expect(view).toContainText('Lifetime')
  await expect(view.getByRole('table', { name: 'By agent' })).toContainText('Claude')
  await expect(view.getByRole('table', { name: 'By agent' })).toContainText('5.0k')
  await expect(view).toContainText('API-equivalent cost (estimate)')
  await tab.hover()
  await expect(tab).toHaveAttribute('title', /Tokens: 5\.0k lifetime · 5\.0k last 30 days/)
})
