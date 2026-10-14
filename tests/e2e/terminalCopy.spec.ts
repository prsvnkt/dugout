import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  clickMenuItem,
  launchApp,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
} from './helpers'

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir())
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

const readClipboard = () => app.evaluate(({ clipboard }) => clipboard.readText())

test('a program copies to the clipboard with OSC 52, but cannot read it', async () => {
  // Arrange: a shell, and something else already on the clipboard
  await app.evaluate(({ clipboard }) => clipboard.writeText('before'))
  const output = await recordTerminalOutput(page)
  await addProjectFolder(app, page, makeGitRepo('alpha'))
  await clickMenuItem(app, 'File', 'New Shell')
  await page.locator('[data-active="true"] [data-testid="terminal"]').click()

  // Act: a read request (never answered), then a copy of UTF-8 text
  const copied = 'héllo 🚀'
  const data = Buffer.from(copied, 'utf8').toString('base64')
  await page.keyboard.type(`printf '\\033]52;c;?\\a\\033]52;c;${data}\\a'; echo sent\n`)
  await expect.poll(output).toContain('sent')

  // Assert
  await expect.poll(readClipboard).toBe(copied)
  // An answered read would type the old clipboard, base64-encoded, into the shell.
  expect(await output()).not.toContain(Buffer.from('before').toString('base64'))
})
