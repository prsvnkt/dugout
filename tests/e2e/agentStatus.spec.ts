import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeGitRepo,
  makeTempDir,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), { DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

async function addProject(name: string): Promise<void> {
  await stubFolderPicker(app, makeGitRepo(name))
  await page
    .getByRole('button', { name: /Add project/ })
    .first()
    .click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add project' }).click()
  await expect(dialog).toBeHidden()
}

const paneHeader = () => page.locator('[data-active="true"] header')
const sidebarItem = (name: string) =>
  page.getByRole('navigation').getByRole('listitem').filter({ hasText: name })
const dockBadge = () => app.evaluate(({ app: electronApp }) => electronApp.dock?.getBadge() ?? '')

async function send(line: string): Promise<void> {
  await page.locator('[data-active="true"] [data-testid="terminal"]').click()
  await page.keyboard.type(`${line}\n`)
}

test('Claude hooks drive the pane, sidebar, status bar and dock badge', async () => {
  // Arrange
  await addProject('alpha')
  await clickMenuItem(app, 'File', 'New Claude Pane')
  await expect(paneHeader()).toContainText('Ready')

  // Act + Assert: a turn that needs approval
  await send('prompt')
  await expect(paneHeader()).toContainText('Working')

  await send('ask')
  await expect(paneHeader()).toContainText('Needs you')
  await expect(sidebarItem('alpha')).toContainText('Needs you')
  await expect(page.getByRole('contentinfo')).toContainText('1 needs you')
  await expect.poll(dockBadge).toBe('1')

  await send('tool')
  await expect(paneHeader()).toContainText('Working')
  await expect.poll(dockBadge).toBe('')

  // Idle reminders are not a request for input
  await send('notify-idle')
  await expect(paneHeader()).toContainText('Working')
})

test('a turn that finishes in a background project shows as Done until viewed', async () => {
  await addProject('alpha')
  await clickMenuItem(app, 'File', 'New Claude Pane')
  await expect(paneHeader()).toContainText('Ready')
  await send('prompt')
  await send('stop-later')

  await addProject('beta')
  await expect(sidebarItem('alpha')).toContainText('Done')

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus())
  await sidebarItem('alpha')
    .getByRole('button', { name: /^alpha/ })
    .click()
  await expect(paneHeader()).toContainText('Ready')
  await expect(sidebarItem('alpha')).not.toContainText('Done')
})
