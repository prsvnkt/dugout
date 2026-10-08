import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
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

for (const agent of ['Claude', 'Codex']) {
  test(`Shift+Enter starts a new line in a ${agent} agent, Enter still submits`, async () => {
    // Arrange: an agent whose TTY is raw, so it sees the exact bytes each key sends
    const output = await recordTerminalOutput(page)
    await addProjectFolder(app, page, makeGitRepo('alpha'))
    await clickMenuItem(app, 'File', `New ${agent} Agent`)
    await expect.poll(output).toContain('ready')
    await page.locator('[data-active="true"] [data-testid="terminal"]').click()
    await page.keyboard.type('raw-keys\n')
    await expect.poll(output).toContain('raw-keys on')

    // Act
    await page.keyboard.press('Shift+Enter')
    await expect.poll(output).toContain('keys="\\n"')
    await page.keyboard.press('Enter')

    // Assert
    await expect.poll(output).toContain('keys="\\r"')
    expect(await output()).not.toContain('keys="\\n\\r"')
  })
}
