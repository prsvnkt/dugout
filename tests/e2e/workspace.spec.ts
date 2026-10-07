import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  chooseNewAgentAction,
  clickMenuItem,
  openAddProjectFromTabs,
  launchApp,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
  terminalIdsSeen,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page
let userDataDir: string

test.beforeEach(async () => {
  userDataDir = makeTempDir()
  app = await launchApp(userDataDir)
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

async function addProject(repo: string, opener: () => Promise<void>): Promise<void> {
  await stubFolderPicker(app, repo)
  await opener()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add project' }).click()
  await expect(dialog).toBeHidden()
}

const activeWorkspace = () => page.locator('[data-active="true"]')

test('adds projects, runs split terminals, and keeps them alive across switches', async () => {
  // Arrange
  const alpha = makeGitRepo('alpha')
  const beta = makeGitRepo('beta')
  const output = await recordTerminalOutput(page)

  // Act: first project with two shells side by side
  await addProject(alpha, () => page.getByRole('button', { name: 'Add project…' }).click())
  await activeWorkspace()
    .getByRole('button', { name: /New shell/ })
    .click()
  await chooseNewAgentAction(activeWorkspace(), 'New shell')
  await expect(activeWorkspace().getByText('Running')).toHaveCount(2)
  await expect(page.getByText('2 terminals')).toBeVisible()

  // Act: second project, then back to the first
  await addProject(beta, () => openAddProjectFromTabs(page))
  await expect(page.getByRole('contentinfo')).toContainText('beta')
  await page.getByRole('button', { name: 'alpha', exact: true }).click()

  // Assert: the first project's terminals are still running and accept input
  await expect(page.getByText('2 terminals')).toBeVisible()
  await activeWorkspace().getByTestId('terminal').last().click()
  await page.keyboard.type('echo still-$((40 + 2))-alive\n')
  await expect.poll(output).toContain('still-42-alive')
})

test('rejects a folder that is not a git repository', async () => {
  await stubFolderPicker(app, makeTempDir())
  await page.getByRole('button', { name: 'Add project…' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add project' }).click()
  await expect(dialog.getByRole('alert')).toContainText('not inside a git repository')
})

test('remembers projects across restarts', async () => {
  await addProject(makeGitRepo('gamma'), () =>
    page.getByRole('button', { name: 'Add project…' }).click(),
  )
  await app.close()

  app = await launchApp(userDataDir)
  page = await app.firstWindow()

  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'gamma', exact: true }),
  ).toBeVisible()
})

test('menu commands open and close panes in the selected project', async () => {
  await addProject(makeGitRepo('delta'), () =>
    page.getByRole('button', { name: 'Add project…' }).click(),
  )

  await clickMenuItem(app, 'File', 'New Shell')
  await clickMenuItem(app, 'File', 'New Shell')
  await expect(page.getByText('2 terminals')).toBeVisible()

  await clickMenuItem(app, 'File', 'Close Tab, Agent or Shell')
  await expect(page.getByText('1 terminal', { exact: true })).toBeVisible()
})

test('a newly split pane starts its process at the full pane width', async () => {
  // Regression: panes mount at ~0 width and the resize was lost before the PTY connected,
  // leaving `claude` rendering into a 2-column terminal.
  const output = await recordTerminalOutput(page)
  await addProject(makeGitRepo('epsilon'), () =>
    page.getByRole('button', { name: 'Add project…' }).click(),
  )

  await clickMenuItem(app, 'File', 'New Shell')
  await clickMenuItem(app, 'File', 'New Shell')
  await clickMenuItem(app, 'File', 'New Shell')
  await expect(activeWorkspace().getByText('Running')).toHaveCount(3)
  await activeWorkspace().getByTestId('terminal').last().click()
  await page.keyboard.type('echo "pty-size:$(stty size)"\n')

  await expect.poll(output).toMatch(/pty-size:\d+ \d+/)
  const [, rows, cols] = /pty-size:(\d+) (\d+)/.exec(await output()) ?? []
  // The bug left the PTY at 2 columns; three panes beside the git panel are ~30 columns each.
  expect(Number(cols)).toBeGreaterThan(20)
  expect(Number(rows)).toBeGreaterThan(20)
})

test('revealing a terminal (as a notification click does) switches to its project', async () => {
  // Arrange: a shell in alpha, then switch to beta
  const output = await recordTerminalOutput(page)
  await addProject(makeGitRepo('alpha'), () =>
    page.getByRole('button', { name: 'Add project…' }).click(),
  )
  await clickMenuItem(app, 'File', 'New Shell')
  await expect.poll(output).not.toBe('')
  const [terminalId] = await terminalIdsSeen(page)
  await addProject(makeGitRepo('beta'), () => openAddProjectFromTabs(page))
  await expect(page.getByRole('contentinfo')).toContainText('beta')

  // Act
  await app.evaluate(({ BrowserWindow }, id) => {
    BrowserWindow.getAllWindows()[0]?.webContents.send('app:command', {
      type: 'terminal.reveal',
      terminalId: id,
    })
  }, terminalId)

  // Assert
  await expect(page.getByRole('contentinfo')).toContainText('alpha')
})
