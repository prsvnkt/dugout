import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page
let userDataDir: string
let fakeClaude: string

async function start(): Promise<void> {
  app = await launchApp(userDataDir, { DUGOUT_CLAUDE_COMMAND: fakeClaude })
  page = await app.firstWindow()
}

test.beforeEach(async () => {
  userDataDir = makeTempDir()
  fakeClaude = makeFakeClaude()
  await start()
})

test.afterEach(async () => {
  await app.close()
})

const workspace = () => page.locator('[data-active="true"]')
const paneRegions = () => workspace().getByRole('region', { name: /terminal$/ })

async function addProject(name: string): Promise<void> {
  await stubFolderPicker(app, makeGitRepo(name))
  await page.getByRole('button', { name: 'Add project…' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add project' }).click()
  await expect(dialog).toBeHidden()
}

function sessionFrom(output: string): string {
  return /session=(fake-session-\d+)/.exec(output)?.[1] ?? ''
}

test('panes are restored on relaunch and Claude resumes its conversation', async () => {
  // Arrange: one Claude pane and one shell
  const firstRun = await recordTerminalOutput(page)
  await addProject('alpha')
  await clickMenuItem(app, 'File', 'New Claude Pane')
  await clickMenuItem(app, 'File', 'New Shell Pane')
  await expect.poll(firstRun).toContain('resume=none')
  const sessionId = sessionFrom(await firstRun())
  expect(sessionId).not.toBe('')
  await expect(paneRegions().first()).toContainText('Ready')
  // Only sessions with a conversation are resumable, so send a prompt first.
  await workspace().getByTestId('terminal').first().click()
  await page.keyboard.type('prompt\n')
  await expect(paneRegions().first()).toContainText('Working')
  // Give the debounced layout save time to run.
  await page.waitForTimeout(1_000)

  // Act
  await app.close()
  await start()
  const secondRun = await recordTerminalOutput(page)

  // Assert
  await expect(paneRegions()).toHaveCount(2)
  await expect.poll(secondRun).toContain(`resume=${sessionId}`)
  await expect(paneRegions().first()).toContainText('Ready')
})

test('a Claude pane that was never prompted restarts fresh after relaunch', async () => {
  const firstRun = await recordTerminalOutput(page)
  await addProject('gamma')
  await clickMenuItem(app, 'File', 'New Claude Pane')
  await expect.poll(firstRun).toContain('resume=none')
  await expect(paneRegions()).toContainText('Ready')
  await page.waitForTimeout(1_000)

  await app.close()
  await start()
  const secondRun = await recordTerminalOutput(page)

  await expect(paneRegions()).toHaveCount(1)
  await expect.poll(secondRun).toContain('resume=none')
})

test('an exited Claude pane can be restarted, resuming its conversation', async () => {
  const output = await recordTerminalOutput(page)
  await addProject('beta')
  await clickMenuItem(app, 'File', 'New Claude Pane')
  await expect.poll(output).toContain('resume=none')
  const sessionId = sessionFrom(await output())
  await expect(paneRegions()).toContainText('Ready')

  await workspace().getByTestId('terminal').click()
  await page.keyboard.type('prompt\n')
  await page.keyboard.type('exit\n')
  await expect(paneRegions()).toContainText('Exited')
  await paneRegions().getByRole('button', { name: 'Restart' }).click()

  await expect.poll(output).toContain(`resume=${sessionId}`)
  await expect(paneRegions()).toContainText('Ready')
})
