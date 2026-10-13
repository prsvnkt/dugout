import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { addProjectFolder, clickMenuItem, launchApp, makeTempDir } from './helpers'

let app: ElectronApplication
let page: Page

function makeRepo(): string {
  const root = join(makeTempDir(), 'keys')
  mkdirSync(join(root, 'src'), { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  writeFileSync(join(root, 'src', 'app.ts'), 'export const answer = 42\n')
  writeFileSync(join(root, 'readme.md'), '# Keys\n')
  writeFileSync(join(root, 'notes.md'), '# Notes\n')
  return root
}

test.beforeEach(async () => {
  app = await launchApp(makeTempDir())
  page = await app.firstWindow()
  await addProjectFolder(app, page, makeRepo())
})

test.afterEach(async () => {
  await app.close()
})

const explorer = () => page.getByRole('complementary', { name: 'Explorer' })
const tree = () => explorer().getByRole('tree', { name: 'Files' })
/** Rows' names carry their change ("notes.md — untracked"), so match the start. */
const treeItem = (name: string) =>
  tree().getByRole('treeitem', { name: new RegExp(`^${name.replaceAll('.', '\\.')}( —|$)`) })
const editor = () => page.getByRole('region', { name: 'Editor' })
const tab = (name: RegExp) => editor().getByRole('tab', { name })

test('arrow keys move through the explorer tree; Right opens a folder, Left closes it', async () => {
  // Arrange: the keyboard on the first row
  await treeItem('src').focus()

  // Act + Assert: Right opens the folder, Right again enters it
  await page.keyboard.press('ArrowRight')
  await expect(treeItem('src')).toHaveAttribute('aria-expanded', 'true')
  await expect(treeItem('src')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(treeItem('app.ts')).toBeFocused()
  await expect(treeItem('app.ts')).toHaveAttribute('aria-level', '2')

  // Left goes back to the parent, Left again closes it
  await page.keyboard.press('ArrowLeft')
  await expect(treeItem('src')).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(treeItem('src')).toHaveAttribute('aria-expanded', 'false')
  await expect(treeItem('app.ts')).toBeHidden()

  // Down and End move between rows; only the focused row is in the Tab order
  await page.keyboard.press('ArrowDown')
  await expect(treeItem('notes.md')).toBeFocused()
  await page.keyboard.press('End')
  await expect(treeItem('readme.md')).toBeFocused()
  await expect(treeItem('readme.md')).toHaveAttribute('tabindex', '0')
  await expect(treeItem('src')).toHaveAttribute('tabindex', '-1')

  // Enter opens the file
  await page.keyboard.press('Enter')
  await expect(tab(/readme\.md/)).toHaveAttribute('aria-selected', 'true')
})

test('arrow keys move between editor tabs and show each one', async () => {
  // Arrange: two pinned tabs, readme.md active
  await treeItem('notes.md').dblclick()
  await expect(tab(/notes\.md/)).toBeVisible()
  await treeItem('readme.md').dblclick()
  await expect(tab(/readme\.md/)).toHaveAttribute('aria-selected', 'true')
  await expect(editor().getByRole('tabpanel')).toContainText('# Keys')
  await tab(/readme\.md/).focus()

  // Act: Left goes to the previous tab and activates it, keeping focus on the tabs
  await page.keyboard.press('ArrowLeft')

  // Assert
  await expect(tab(/notes\.md/)).toBeFocused()
  await expect(tab(/notes\.md/)).toHaveAttribute('aria-selected', 'true')
  await expect(tab(/notes\.md/)).toHaveAttribute('tabindex', '0')
  await expect(tab(/readme\.md/)).toHaveAttribute('tabindex', '-1')
  await expect(editor().getByRole('tabpanel')).toContainText('# Notes')

  // Left again wraps to the last tab; Home goes back to the first
  await page.keyboard.press('ArrowLeft')
  await expect(tab(/readme\.md/)).toBeFocused()
  await expect(tab(/readme\.md/)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Home')
  await expect(tab(/notes\.md/)).toHaveAttribute('aria-selected', 'true')
})

test('a menu takes focus when it opens, and Escape gives it back to its button', async () => {
  // Act: open the rail's "+" menu with the mouse
  const trigger = page.getByRole('button', { name: 'New agent' })
  await trigger.click()
  const menu = page.getByRole('menu', { name: 'New agent' })
  const items = menu.getByRole('menuitem')

  // Assert: the first item has focus; arrows move and wrap
  await expect(items.first()).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(items.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect(items.last()).toBeFocused()

  // Escape closes it and returns focus to the button
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(trigger).toBeFocused()
  await expect(trigger).toHaveAttribute('aria-expanded', 'false')
})

test('the close-project confirmation is a modal dialog that returns focus on Escape', async () => {
  // Arrange: a shell, so closing asks first
  await clickMenuItem(app, 'File', 'New Shell')
  const close = page.getByRole('navigation').getByRole('button', { name: 'Close keys' })

  // Act
  await close.click()
  const confirm = page.getByRole('dialog', { name: 'Close keys?' })

  // Assert: focus is in the dialog; Escape cancels and goes back to the × button
  await expect(confirm.getByRole('button', { name: 'Close project' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(confirm).toBeHidden()
  await expect(close).toBeFocused()
  await expect(
    page.getByRole('navigation').getByRole('button', { name: 'keys', exact: true }),
  ).toBeVisible()
})
