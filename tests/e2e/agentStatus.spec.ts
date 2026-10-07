import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  openAddProject,
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
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
})

test.afterEach(async () => {
  await app.close()
})

async function addProject(name: string): Promise<void> {
  await stubFolderPicker(app, makeGitRepo(name))
  await openAddProject(page)
  await expect(
    page.getByRole('navigation').getByRole('button', { name, exact: true }),
  ).toBeVisible()
}

const paneHeader = () =>
  page
    .locator('[data-active="true"]')
    .getByRole('region', { name: /terminal$/ })
    .locator('header')
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
  await clickMenuItem(app, 'File', 'New Claude Agent')
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

test('Codex hooks drive a Codex pane the same way', async () => {
  await addProject('alpha')
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect(paneHeader()).toContainText('Codex')
  await expect(paneHeader()).toContainText('Ready')

  await send('prompt')
  await expect(paneHeader()).toContainText('Working')
  await send('ask')
  await expect(paneHeader()).toContainText('Needs you')
  await expect(page.getByRole('contentinfo')).toContainText('1 needs you')
  // A finished turn in the pane you are looking at is already seen
  await send('stop')
  await expect(paneHeader()).toContainText('Ready')
})

test('a turn that finishes in a background project shows as Done until viewed', async () => {
  await addProject('alpha')
  await clickMenuItem(app, 'File', 'New Claude Agent')
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

test('the inbox lists agents that need you across projects and jumps to them', async () => {
  // Arrange: an agent in alpha asks for approval, then we switch to beta
  await addProject('alpha')
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(paneHeader()).toContainText('Ready')
  await send('ask')
  await expect(paneHeader()).toContainText('Needs you')
  await addProject('beta')
  await expect(page.getByRole('contentinfo')).toContainText('beta')

  // Act
  const inboxButton = page.getByRole('banner').getByRole('button', { name: /^Inbox, 1 need you/ })
  await inboxButton.click()
  const inbox = page.getByRole('dialog', { name: 'Inbox' })
  await expect(inbox.getByRole('region', { name: 'Needs you' })).toContainText('Bash: npm install')
  await inbox.getByRole('button', { name: /alpha · Claude: Bash: npm install/ }).click()

  // Assert: back in alpha, focused on that agent
  await expect(inbox).toBeHidden()
  await expect(page.getByRole('contentinfo')).toContainText('alpha')
  await expect(paneHeader()).toContainText('Needs you')
})
