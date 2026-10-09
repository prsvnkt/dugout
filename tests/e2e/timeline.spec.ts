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

test.beforeEach(async () => {
  // Stand-ins for ~/.claude and ~/.codex, where the fakes write their transcripts.
  app = await launchApp(makeTempDir(), {
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_CODEX_COMMAND: makeFakeCodex(),
    CLAUDE_CONFIG_DIR: makeTempDir('dugout-claude-'),
    CODEX_HOME: makeTempDir('dugout-codex-'),
  })
  page = await app.firstWindow()
  await addProjectFolder(app, page, makeGitRepo('alpha'))
})

test.afterEach(async () => {
  await app.close()
})

const paneHeader = (index: number) =>
  page
    .locator('[data-active="true"]')
    .getByRole('region', { name: /terminal$/ })
    .nth(index)
    .locator('header')

async function send(line: string, pane: number): Promise<void> {
  await page.locator('[data-active="true"] [data-testid="terminal"]').nth(pane).click()
  await page.keyboard.type(`${line}\n`)
}

const timeline = () => page.getByRole('region', { name: 'Session timeline' })

test('an agent header opens its session timeline, which fills in as the agent works', async () => {
  // Arrange
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(paneHeader(0)).toContainText('Ready')

  // Act: open it once the conversation has started, before the transcript exists, then work
  await send('prompt', 0)
  await paneHeader(0).getByRole('button', { name: 'Open session timeline' }).click()
  await expect(page.getByRole('tab', { name: 'Timeline · Claude' })).toBeVisible()
  await expect(timeline().getByRole('alert')).toContainText('No transcript for this session yet')
  await send('work', 0)

  // Assert: prompts, tool calls with their outcome, the subagent, files and the final message
  const steps = timeline().getByRole('list', { name: 'Steps' })
  await expect(steps).toContainText('Fix the login bug')
  await expect(steps.getByRole('listitem').filter({ hasText: 'npm test' })).toContainText('Failed')
  await expect(steps.getByRole('listitem').filter({ hasText: 'Edit' })).toContainText('Succeeded')
  await expect(steps).toContainText('Subagent · code-reviewer')
  await expect(timeline().getByRole('region', { name: 'Files touched' })).toContainText(
    'src/login.ts',
  )
  await expect(timeline().getByRole('region', { name: 'Final message' })).toContainText(
    'Fixed the login bug.',
  )
  await expect(timeline()).toContainText('2 tool calls (1 failed) · 1 subagent · 1 file edited')

  // Tokens stay in Token usage, which the timeline links to
  await timeline().getByRole('button', { name: 'Token usage' }).click()
  await expect(page.getByRole('region', { name: 'Token usage' })).toBeVisible()
})

test("a Codex agent's timeline comes from its session log", async () => {
  // Arrange
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect(paneHeader(0)).toContainText('Ready')
  await send('work', 0)

  // Act
  await paneHeader(0).getByRole('button', { name: 'Open session timeline' }).click()

  // Assert
  const steps = timeline().getByRole('list', { name: 'Steps' })
  await expect(steps.getByRole('listitem').filter({ hasText: 'npm test' })).toContainText('Failed')
  await expect(steps).toContainText('apply_patch')
  await expect(timeline().getByRole('region', { name: 'Files touched' })).toContainText(
    'src/login.ts',
  )
  await expect(timeline().getByRole('region', { name: 'Final message' })).toContainText(
    'Fixed the login bug.',
  )
})
