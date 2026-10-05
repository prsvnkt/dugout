import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'

interface TestWindow {
  readonly dugout: DugoutApi
  terminalOutput: string[]
}

let app: ElectronApplication

test.beforeEach(async () => {
  app = await electron.launch({ args: ['.'] })
})

test.afterEach(async () => {
  await app.close()
})

test('opens a shell in the chosen folder and round-trips input', async () => {
  // Arrange: stub the native folder picker, which Playwright cannot drive.
  const folder = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-e2e-')))
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] })
  }, folder)
  const page = await app.firstWindow()
  await page.evaluate(() => {
    const testWindow = globalThis as unknown as TestWindow
    testWindow.terminalOutput = []
    testWindow.dugout.terminal.onData((_id, data) => testWindow.terminalOutput.push(data))
  })

  // Act
  await page.getByRole('button', { name: 'Open shell…' }).click()
  await expect(page.getByText('Running')).toBeVisible()
  await page.getByTestId('terminal').click()
  await page.keyboard.type('pwd\n')

  // Assert
  await expect
    .poll(() => page.evaluate(() => (globalThis as unknown as TestWindow).terminalOutput.join('')))
    .toContain(folder)
})
