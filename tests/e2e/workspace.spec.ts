import { readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
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
  // Added straight away, named after its folder.
  const name = basename(repo)
  await expect(
    page.getByRole('navigation').getByRole('button', { name, exact: true }),
  ).toBeVisible()
}

/** A colour token from styles/tokens.css, as the browser reports it (`rgb(r, g, b)`). */
function tokenAsRgb(name: string): string {
  const tokens = readFileSync(join(process.cwd(), 'src/renderer/src/styles/tokens.css'), 'utf8')
  const hex = new RegExp(`${name}: #([0-9a-f]{6});`).exec(tokens)?.[1]
  if (!hex) throw new Error(`No hex value for ${name} in tokens.css`)
  const [r, g, b] = [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16))
  return `rgb(${r}, ${g}, ${b})`
}

const activeWorkspace = () => page.locator('[data-active="true"]')
/** Status labels in terminal headers (the Agents list repeats agents' statuses). */
const paneStatuses = (text: string) =>
  activeWorkspace()
    .getByRole('region', { name: /terminal$/ })
    .getByText(text)

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
  await expect(paneStatuses('Running')).toHaveCount(2)
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
  await expect(page.getByRole('alert')).toContainText('not inside a git repository')
})

test('a project is named after its folder and closes from its tab', async () => {
  // Arrange: no "+" in the title bar until there is a project
  await expect(page.getByRole('button', { name: 'New project' })).toBeHidden()
  await addProject(makeGitRepo('omega'), () =>
    page.getByRole('button', { name: 'Add project…' }).click(),
  )
  const tabs = page.getByRole('navigation')
  await expect(tabs.getByRole('button', { name: 'omega', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'New project' })).toBeVisible()
  await clickMenuItem(app, 'File', 'New Shell')

  // Act: closing a project with a shell open asks first
  await tabs.getByRole('button', { name: 'Close omega' }).click()
  const confirm = page.getByRole('dialog', { name: 'Close omega?' })
  await expect(confirm).toContainText('will stop')
  await confirm.getByRole('button', { name: 'Close project' }).click()

  // Assert: back to the welcome screen
  await expect(tabs.getByRole('button', { name: 'omega', exact: true })).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Welcome to Dugout' })).toBeVisible()
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
  await expect(paneStatuses('Running')).toHaveCount(3)
  await activeWorkspace().getByTestId('terminal').last().click()
  await page.keyboard.type('echo "pty-size:$(stty size)"\n')

  await expect.poll(output).toMatch(/pty-size:\d+ \d+/)
  const [, rows, cols] = /pty-size:(\d+) (\d+)/.exec(await output()) ?? []
  // The bug left the PTY at 2 columns. Three panes beside the git panel are ~30 columns each on
  // a laptop screen, but only ~16 on CI's smaller display, so check for "clearly not 2".
  expect(Number(cols)).toBeGreaterThan(10)
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

test('lines between terminals and panels use the stronger divider colour', async () => {
  // Arrange: two shells side by side
  await addProject(makeGitRepo('lines'), () =>
    page.getByRole('button', { name: 'Add project…' }).click(),
  )
  await activeWorkspace()
    .getByRole('button', { name: /New shell/ })
    .click()
  await chooseNewAgentAction(activeWorkspace(), 'New shell')
  await expect(paneStatuses('Running')).toHaveCount(2)

  // Act
  const divider = tokenAsRgb('--divider')
  const separators = activeWorkspace().locator('[role="separator"][data-separator]')

  // Assert
  expect(await separators.count()).toBeGreaterThan(0)
  for (const separator of await separators.all()) {
    await expect(separator).toHaveCSS('background-color', divider)
  }
})
