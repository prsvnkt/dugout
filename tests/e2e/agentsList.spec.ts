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

test.describe('subagents', () => {
  const subagentLines = () => agentRows().first().getByTestId('subagent')

  for (const agent of ['Claude', 'Codex'] as const) {
    test(`${agent} subagents show under their agent until its next turn`, async () => {
      // Arrange
      await clickMenuItem(app, 'File', `New ${agent} Agent`)
      await expect(agentRows().first()).toContainText('Ready')
      await send('prompt')

      // Act: two subagents start, one finishes
      await send('subagent-start a1 Explore')
      await send('subagent-start a2 code-reviewer')
      await expect(subagentLines()).toHaveCount(2)
      await expect(subagentLines().nth(0)).toContainText('Explore')
      await expect(subagentLines().nth(0)).toContainText('Running')
      await send('subagent-stop a1 Explore')

      // Assert: running first, the finished one done with its reply as a tooltip
      await expect(subagentLines().nth(0)).toContainText('code-reviewer')
      await expect(subagentLines().nth(1)).toContainText('Done')
      await expect(subagentLines().nth(1)).toHaveAttribute('title', 'Report from a1')

      // The next turn clears finished subagents; running ones stay
      await send('stop')
      await send('prompt')
      await expect(subagentLines()).toHaveCount(1)
      await expect(subagentLines().first()).toContainText('code-reviewer')
    })
  }
})
