import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
  terminalIdsSeen,
} from './helpers'

let app: ElectronApplication
let page: Page
let repo: string

function makeRepo(): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(join(root, 'src'), { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  writeFileSync(join(root, 'src', 'app.ts'), 'export const answer = 41\n')
  writeFileSync(join(root, 'readme.md'), '# App\n')
  return root
}

test.beforeEach(async () => {
  app = await launchApp(makeTempDir())
  page = await app.firstWindow()
  repo = makeRepo()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test.afterEach(async () => {
  await app.close()
})

const explorer = () => page.getByRole('complementary', { name: 'Explorer' })
const editor = () => page.getByRole('region', { name: 'Editor' })

async function openFromExplorer(...segments: string[]): Promise<void> {
  for (const name of segments) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await explorer()
      .getByRole('treeitem', { name: new RegExp(`^${escaped}( —|$)`) })
      .click()
  }
}

async function typeInEditor(text: string): Promise<void> {
  await editor().locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.type(text)
}

test('a file opens in the center while terminals keep running', async () => {
  // Arrange: a running shell
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'File', 'New Shell Pane')
  await expect.poll(output).not.toBe('')

  // Act
  await openFromExplorer('src', 'app.ts')

  // Assert: shown in the editor above the terminal, and the same shell still works
  await expect(editor()).toContainText('export const answer = 41')
  await page.locator('[data-testid="terminal"]').click()
  await page.keyboard.type('echo still-$((20 + 22))\n')
  await expect.poll(output).toContain('still-42')
  expect(await terminalIdsSeen(page)).toHaveLength(1)
})

test('edits are saved to disk', async () => {
  await openFromExplorer('src', 'app.ts')
  await expect(editor()).toContainText('answer = 41')

  await typeInEditor('export const saved = true')
  await expect(editor().getByRole('button', { name: /unsaved/ })).toBeVisible()
  await clickMenuItem(app, 'File', 'Save')

  await expect
    .poll(() => readFileSync(join(repo, 'src', 'app.ts'), 'utf8'))
    .toContain('export const saved = true')
  await expect(editor().getByRole('button', { name: /unsaved/ })).toBeHidden()
})

test('an open file reloads when an agent changes it on disk', async () => {
  await openFromExplorer('readme.md')
  await expect(editor()).toContainText('# App')

  writeFileSync(join(repo, 'readme.md'), '# App\n\nEdited by an agent\n')

  await expect(editor()).toContainText('Edited by an agent', { timeout: 10_000 })
})

test('unsaved edits are protected when the file changes on disk', async () => {
  await openFromExplorer('readme.md')
  await expect(editor()).toContainText('# App')
  await typeInEditor('my unsaved line')

  writeFileSync(join(repo, 'readme.md'), '# Agent version\n')

  await expect(editor().getByRole('alert')).toContainText('Changed on disk', { timeout: 10_000 })
  await editor().getByRole('button', { name: 'Keep mine' }).click()
  await clickMenuItem(app, 'File', 'Save')
  await expect
    .poll(() => readFileSync(join(repo, 'readme.md'), 'utf8'))
    .toContain('my unsaved line')
})

test('closing a tab with unsaved edits asks first', async () => {
  await openFromExplorer('readme.md')
  await typeInEditor('draft')

  await editor()
    .getByRole('button', { name: /Close readme\.md \(unsaved\)/ })
    .click()
  await expect(editor().getByRole('alertdialog')).toContainText('Save changes to readme.md?')
  await editor().getByRole('button', { name: 'Don’t Save' }).click()

  await expect(editor()).toBeHidden()
  expect(readFileSync(join(repo, 'readme.md'), 'utf8')).toBe('# App\n')
})

test('⌘W closes the editor tab when the editor has focus, otherwise the pane', async () => {
  await clickMenuItem(app, 'File', 'New Shell Pane')
  await openFromExplorer('readme.md')
  await editor().locator('.monaco-editor .view-lines').click()

  await clickMenuItem(app, 'File', 'Close Tab or Pane')
  await expect(editor()).toBeHidden()
  await expect(page.getByRole('region', { name: 'Shell terminal' })).toHaveCount(1)

  await page.locator('[data-testid="terminal"]').click()
  await clickMenuItem(app, 'File', 'Close Tab or Pane')
  await expect(page.getByRole('region', { name: 'Shell terminal' })).toHaveCount(0)
})

test('the explorer can be toggled', async () => {
  await expect(explorer()).toBeVisible()
  await clickMenuItem(app, 'View', 'Toggle Explorer')
  await expect(explorer()).toBeHidden()
  await clickMenuItem(app, 'View', 'Toggle Explorer')
  await expect(explorer()).toBeVisible()
})
