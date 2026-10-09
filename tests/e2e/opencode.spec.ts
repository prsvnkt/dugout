import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  chooseNewAgentAction,
  clickMenuItem,
  launchApp,
  makeFakeOpenCode,
  makeGitRepo,
  makeTempDir,
  openAddProject,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), { DUGOUT_OPENCODE_COMMAND: makeFakeOpenCode() })
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
const paneHeader = () =>
  workspace().getByRole('region', { name: 'OpenCode terminal' }).locator('header')

async function send(line: string): Promise<void> {
  await workspace()
    .getByRole('region', { name: 'OpenCode terminal' })
    .getByTestId('terminal')
    .click()
  await page.keyboard.type(`${line}\n`)
}

test('starts OpenCode from the "+" menu, with the dugout server and status from its plugin', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)

  // Act
  await chooseNewAgentAction(workspace(), 'New OpenCode agent')

  // Assert: the plugin reports ready, and the agent got Dugout's task server
  await expect(paneHeader()).toContainText('OpenCode')
  await expect(paneHeader()).toContainText('Ready')
  await expect.poll(output).toContain('mcp=dugout')
  await expect.poll(output).toContain('fake-opencode ready resume=none')

  // A turn, a permission request and the turn ending map to Dugout's statuses
  await send('prompt')
  await expect(paneHeader()).toContainText('Working')
  await send('ask')
  await expect(paneHeader()).toContainText('Needs you')
  await expect(page.getByRole('contentinfo')).toContainText('1 needs you')
  await send('stop')
  await expect(paneHeader()).toContainText('Ready')
})

test('⌘T starts the default agent chosen on the start screen', async () => {
  // Arrange
  await workspace().getByRole('combobox', { name: 'Agent' }).selectOption('opencode')

  // Act
  await clickMenuItem(app, 'File', 'New Agent')

  // Assert
  await expect(paneHeader()).toContainText('Ready')
})
