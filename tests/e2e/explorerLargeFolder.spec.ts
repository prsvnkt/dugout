import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { addProjectFolder, launchApp, makeTempDir } from './helpers'

/** As many entries as one folder listing returns (`MAX_DIR_ENTRIES`). */
const PACKAGE_COUNT = 5_000
/** Far more than a window of rows, far fewer than the folder: proves the list is windowed. */
const MAX_RENDERED_ROWS = 200
/** Generous, so a busy machine does not fail it; the real number goes in the annotations. */
const MAX_EXPAND_MS = 10_000

let app: ElectronApplication
let page: Page

/** A repo with an ignored, node_modules-like folder of PACKAGE_COUNT entries. */
function makeRepo(): string {
  const root = join(makeTempDir(), 'big')
  const modules = join(root, 'node_modules')
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(modules)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(root, 'readme.md'), '# Big\n')
  for (let index = 0; index < PACKAGE_COUNT; index++) {
    writeFileSync(join(modules, `pkg-${String(index).padStart(4, '0')}.js`), '')
  }
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

const tree = () =>
  page.getByRole('complementary', { name: 'Explorer' }).getByRole('tree', { name: 'Files' })
const treeItem = (name: string) =>
  tree().getByRole('treeitem', { name: new RegExp(`^${name.replaceAll('.', '\\.')}( —|$)`) })

/** The few browser globals the timing needs (the e2e tsconfig has no DOM lib). */
interface BrowserGlobals {
  readonly document: { querySelector(selector: string): { click(): void } | null }
  requestAnimationFrame(callback: () => void): number
}

/** Clicks node_modules and resolves once its first child row is on screen; returns the ms. */
function timeExpand(): Promise<number> {
  return page.evaluate(async () => {
    const browser = globalThis as unknown as BrowserGlobals
    const nextFrame = () => new Promise<void>((resolve) => browser.requestAnimationFrame(resolve))
    const row = browser.document.querySelector('[role="treeitem"][data-path="node_modules"]')
    if (!row) throw new Error('node_modules row missing')
    const start = performance.now()
    row.click()
    const firstChild = '[role="treeitem"][data-path="node_modules/pkg-0000.js"]'
    while (!browser.document.querySelector(firstChild)) await nextFrame()
    // One more frame, so the browser has laid out and painted what React committed.
    await nextFrame()
    return performance.now() - start
  })
}

test('a folder of 5,000 entries renders only a window of rows', async () => {
  // Arrange
  await expect(treeItem('node_modules')).toHaveAttribute('data-ignored', 'true')

  // Act
  const expandMs = await timeExpand()
  const rendered = await tree().getByRole('treeitem').count()
  test.info().annotations.push({
    type: 'perf',
    description: `expand ${Math.round(expandMs)} ms, ${rendered} rendered rows`,
  })

  // Assert
  await expect(treeItem('node_modules')).toHaveAttribute('aria-expanded', 'true')
  expect(rendered).toBeLessThan(MAX_RENDERED_ROWS)
  expect(expandMs).toBeLessThan(MAX_EXPAND_MS)
})

test('the keyboard reaches rows outside the window and scrolls them into view', async () => {
  // Arrange: rows are node_modules, its 5,000 entries, src, .gitignore, readme.md
  await treeItem('node_modules').click()
  await expect(treeItem('pkg-0000.js')).toBeVisible()
  await treeItem('node_modules').focus()

  // Act + Assert: End goes past 5,000 rows to the last one, on screen and in the Tab order
  await page.keyboard.press('End')
  await expect(treeItem('readme.md')).toBeFocused()
  await expect(treeItem('readme.md')).toBeInViewport()
  await expect(treeItem('readme.md')).toHaveAttribute('tabindex', '0')
  await expect(treeItem('pkg-0000.js')).toHaveCount(0)

  // Up walks back into the folder's last entries
  for (let step = 0; step < 3; step++) await page.keyboard.press('ArrowUp')
  await expect(treeItem('pkg-4999.js')).toBeFocused()
  await expect(treeItem('pkg-4999.js')).toHaveAttribute('aria-level', '2')
  await expect(treeItem('pkg-4999.js')).toHaveAttribute('aria-posinset', '5000')
  await expect(treeItem('pkg-4999.js')).toHaveAttribute('aria-setsize', '5000')

  // Home comes all the way back
  await page.keyboard.press('Home')
  await expect(treeItem('node_modules')).toBeFocused()
  await expect(treeItem('node_modules')).toBeInViewport()
})
