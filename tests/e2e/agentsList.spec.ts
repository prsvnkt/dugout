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

test('the agents list sits below the files and minimises down with its arrow', async () => {
  await clickMenuItem(app, 'File', 'New Claude Agent')
  const explorer = workspace().getByRole('complementary', { name: 'Explorer' })
  const box = async (locator: typeof explorer) =>
    (await locator.boundingBox()) ?? { y: 0, height: 0 }
  expect((await box(agents())).y).toBeGreaterThan((await box(explorer)).y)
  const heightBefore = (await box(explorer)).height

  await agents().getByRole('button', { name: 'Minimise agents' }).click()

  await expect(agentRows()).toHaveCount(0)
  await expect.poll(async () => (await box(explorer)).height).toBeGreaterThan(heightBefore)

  await agents().getByRole('button', { name: 'Show agents' }).click()
  await expect(agentRows()).toHaveCount(1)
})
