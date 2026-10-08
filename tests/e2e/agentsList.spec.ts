import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
  openAddProject,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), {
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_CODEX_COMMAND: makeFakeCodex(),
  })
  page = await app.firstWindow()
  await stubFolderPicker(app, makeGitRepo('alpha'))
  await openAddProject(page)
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'alpha', exact: true }),
  ).toBeVisible()
})

test.afterEach(async () => {
  await app.close()
})

const workspace = () => page.locator('[data-active="true"]')
const agents = () => workspace().getByRole('region', { name: 'Agents' })
const agentRows = () => agents().getByRole('listitem')
const panes = () => workspace().getByRole('region', { name: /terminal$/ })
const focusedPane = () => workspace().locator('section[data-focused="true"]')

async function send(line: string): Promise<void> {
  await focusedPane().getByTestId('terminal').click()
  await page.keyboard.type(`${line}\n`)
}

test('the sidebar lists the project’s agents with their status, not shells', async () => {
  // Arrange
  await expect(agents()).toContainText('No agents running')

  // Act
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await clickMenuItem(app, 'File', 'New Shell')
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect(panes()).toHaveCount(3)

  // Assert
  await expect(agentRows()).toHaveCount(2)
  await expect(agentRows().nth(0)).toContainText('01Claude')
  await expect(agentRows().nth(1)).toContainText('03Codex')
  await expect(agentRows().nth(0)).toContainText('Ready')

  await send('ask')
  await expect(agentRows().nth(1)).toContainText('Needs you')
  await expect(agentRows().nth(1)).toContainText('Bash: npm install')
})

test('clicking an agent focuses its terminal', async () => {
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(focusedPane().getByTestId('pane-number')).toHaveText('02')

  await agents()
    .getByRole('button', { name: /^01 Claude/ })
    .click()

  await expect(focusedPane().getByTestId('pane-number')).toHaveText('01')
})

test('each agent has its own colour, matching its terminal header', async () => {
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(agentRows()).toHaveCount(2)

  const rowColor = (index: number) =>
    agentRows()
      .nth(index)
      .getByRole('button')
      .evaluate((el) => el.ownerDocument.defaultView?.getComputedStyle(el).borderLeftColor ?? '')
  const headerColor = (index: number) =>
    panes()
      .nth(index)
      .locator('header')
      .evaluate((el) => el.ownerDocument.defaultView?.getComputedStyle(el).borderLeftColor ?? '')

  expect(await rowColor(0)).toBe(await headerColor(0))
  expect(await rowColor(1)).toBe(await headerColor(1))
  expect(await rowColor(0)).not.toBe(await rowColor(1))
})

test('the agents list minimises so the explorer gets the full height', async () => {
  await clickMenuItem(app, 'File', 'New Claude Agent')
  const explorer = workspace().getByRole('complementary', { name: 'Explorer' })
  const toggle = agents().getByRole('button', { name: /^Agents/ })
  const heightBefore = (await explorer.boundingBox())?.height ?? 0

  await toggle.click()

  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(agentRows()).toHaveCount(0)
  await expect
    .poll(async () => (await explorer.boundingBox())?.height ?? 0)
    .toBeGreaterThan(heightBefore)

  await toggle.click()
  await expect(agentRows()).toHaveCount(1)
})
