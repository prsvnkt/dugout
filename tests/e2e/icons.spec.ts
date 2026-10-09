import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import {
  addProjectFolder,
  chooseNewAgentAction,
  launchApp,
  makeGitRepo,
  makeTempDir,
} from './helpers'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir())
  page = await app.firstWindow()
  await addProjectFolder(app, page, makeGitRepo('iconic'))
})

test.afterEach(async () => {
  await app.close()
})

/** An icon button shows one SVG icon and no text; its name comes from its aria-label. */
async function expectIconOnly(button: Locator): Promise<void> {
  await expect(button).toBeVisible()
  await expect(button.locator('svg')).toHaveCount(1)
  await expect(button).toHaveText('')
}

test('the rail and panel headers use icons, not text glyphs', async () => {
  // Arrange
  const rail = page.getByRole('navigation', { name: 'Activity' })
  const button = (name: string | RegExp) => page.getByRole('button', { name, exact: true })

  // Act + Assert: the rail
  for (const name of [/ Explorer$/, / Git panel$/, / Tasks$/, 'New agent']) {
    await expectIconOnly(rail.getByRole('button', { name }))
  }

  // The project tabs and the explorer header
  await expectIconOnly(button('New project'))
  await expectIconOnly(button('Close iconic'))
  await expectIconOnly(button('Refresh explorer'))
  await expectIconOnly(button('Collapse all folders'))

  // The Git panel (open at first) and Tasks panel headers
  const gitPanel = page.getByRole('complementary', { name: 'Source control' })
  await expectIconOnly(gitPanel.getByRole('button', { name: 'Hide Git panel' }))
  await expectIconOnly(gitPanel.getByRole('button', { name: 'Fetch from remotes' }))
  await expectIconOnly(gitPanel.getByRole('button', { name: 'More commit actions' }))
  await rail.getByRole('button', { name: 'Show Tasks' }).click()
  await expectIconOnly(button('Hide Tasks panel'))

  // A shell's header
  await chooseNewAgentAction(page, 'New shell')
  await expectIconOnly(button('Close Shell pane'))
})
