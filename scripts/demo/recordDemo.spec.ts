import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { addProjectFolder, clickMenuItem, launchApp, makeTempDir } from '../../tests/e2e/helpers'
import { createDemoProject, type DemoProjectName } from './demoProjects'
import { FrameRecorder } from './frameRecorder'

/**
 * The README demo: three sample projects, scripted agents (demoAgent.mjs) and a fake cursor,
 * played in the real app while FrameRecorder screenshots it. `npm run demo:gif` turns the
 * frames into out/demo/demo.gif.
 */

const FRAMES_DIR = resolve('out/demo/frames')
const PROJECTS_DIR = '/tmp/dugout-demo'
const WINDOW_SIZE = { width: 1440, height: 900 }
const TYPING_DELAY_MS = 45
const CURSOR_MOVE_MS = 450
const FINISHED = /Done|Ready/

let app: ElectronApplication
let page: Page

/** Dugout runs agent commands through the shell, so wrap the script in an executable. */
function demoAgentCommand(kind: 'claude' | 'codex'): string {
  const path = join(makeTempDir('dugout-demo-agent-'), kind)
  const agent = resolve('scripts/demo/demoAgent.mjs')
  writeFileSync(path, `#!/bin/sh\nexec "${process.execPath}" "${agent}" ${kind} "$@"\n`, {
    mode: 0o755,
  })
  return path
}

/** The page's DOM, typed just enough for the cursor (scripts build without DOM types). */
interface CursorElement {
  id: string
  innerHTML: string
  readonly style: Record<string, string>
}
interface CursorPage {
  readonly document: {
    readonly body: { append(element: CursorElement): void }
    createElement(tag: 'div'): CursorElement
    getElementById(id: string): CursorElement | null
  }
}

/** Playwright clicks are invisible, so draw an arrow that glides to each target first. */
async function installCursor(): Promise<void> {
  await page.evaluate((moveMs) => {
    const { document } = globalThis as unknown as CursorPage
    const cursor = document.createElement('div')
    cursor.id = 'demo-cursor'
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" ' +
      'fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/></svg>'
    Object.assign(cursor.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      transform: 'translate(720px, 450px)',
      transition: `transform ${moveMs}ms ease-in-out`,
    })
    document.body.append(cursor)
  }, CURSOR_MOVE_MS)
}

async function pointAt(target: Locator): Promise<void> {
  const box = await target.boundingBox()
  if (!box) throw new Error('Demo target is not visible')
  await page.evaluate(
    ({ x, y }) => {
      const { document } = globalThis as unknown as CursorPage
      const cursor = document.getElementById('demo-cursor')
      if (cursor) cursor.style.transform = `translate(${x}px, ${y}px)`
    },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
  )
  await page.waitForTimeout(CURSOR_MOVE_MS + 100)
}

async function click(target: Locator): Promise<void> {
  await pointAt(target)
  await target.click()
}

const workspace = () => page.locator('[data-active="true"]')
const projectListItem = (name: DemoProjectName) =>
  page.getByRole('navigation').getByRole('listitem').filter({ hasText: name })
// A tab's accessible name gains its status ("api Done"), so find it by its list item.
const projectTab = (name: DemoProjectName) => projectListItem(name).getByRole('button').first()
const agentPane = (agent: 'Claude' | 'Codex') =>
  workspace()
    .getByRole('region', { name: /terminal$/ })
    .filter({ has: page.locator('header', { hasText: agent }) })

async function typeIntoTerminal(agent: 'Claude' | 'Codex', text: string): Promise<void> {
  await click(agentPane(agent).getByTestId('terminal'))
  await page.keyboard.type(`${text}\n`, { delay: TYPING_DELAY_MS })
}

/** Background projects: agents that have already done (or are waiting on) some work. */
async function startBackgroundAgents(): Promise<void> {
  await projectTab('api').click()
  const apiPrompt = workspace().getByRole('textbox', { name: /What do you want to work on/ })
  await workspace().getByRole('combobox', { name: 'Agent' }).selectOption('codex')
  await apiPrompt.fill('Use exponential backoff for webhook retries')
  await apiPrompt.press('Enter')
  await expect(agentPane('Codex').locator('header')).toContainText('Working')
  // Leave before it finishes, so its tab shows "Done" (unseen) throughout the demo.
  await projectTab('docs').click()
  await workspace().getByRole('combobox', { name: 'Agent' }).selectOption('claude')
  const docsPrompt = workspace().getByRole('textbox', { name: /What do you want to work on/ })
  await docsPrompt.fill('Document the new wishlist API')
  await docsPrompt.press('Enter')
  await expect(agentPane('Claude').locator('header')).toContainText('Needs you')
  await expect(projectListItem('api')).toContainText('Done')
}

async function playStoryboard(): Promise<void> {
  // 1. Ask an agent for a feature from the project's start screen.
  const prompt = workspace().getByRole('textbox', { name: /What do you want to work on/ })
  await click(prompt)
  await prompt.pressSequentially('Add a wishlist button to the product page', {
    delay: TYPING_DELAY_MS,
  })
  await page.waitForTimeout(400)
  await prompt.press('Enter')
  await expect(agentPane('Claude').locator('header')).toContainText('Working')
  await page.waitForTimeout(1500)

  // 2. Run a second agent beside it.
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect(agentPane('Codex')).toBeVisible()
  await page.waitForTimeout(600)
  await typeIntoTerminal('Codex', 'Cover the cart discount rules with tests')

  // 3. The first agent needs permission: answer it.
  await expect(agentPane('Claude').locator('header')).toContainText('Needs you')
  await page.waitForTimeout(1800)
  await typeIntoTerminal('Claude', 'y')
  // A finished agent in view reads "Done" briefly, then "Ready" once seen.
  await expect(agentPane('Claude').locator('header')).toContainText(FINISHED)
  await expect(agentPane('Codex').locator('header')).toContainText(FINISHED)
  await page.waitForTimeout(1500)

  // 4. Review what changed.
  const panel = page.getByRole('complementary', { name: 'Source control' })
  const diffButton = panel.getByRole('button', { name: /^Open diff of src\/pages\/ProductPage/ })
  await expect(diffButton).toBeVisible()
  await click(diffButton)
  await page.waitForTimeout(3000)

  // 5. The other projects kept going in the background.
  await click(projectTab('api'))
  await page.waitForTimeout(2200)
  await click(projectTab('docs'))
  await page.waitForTimeout(2200)
}

test('records the README demo', async () => {
  test.setTimeout(180_000)
  rmSync(PROJECTS_DIR, { recursive: true, force: true })
  mkdirSync(PROJECTS_DIR)
  app = await launchApp(makeTempDir(), {
    DUGOUT_CLAUDE_COMMAND: demoAgentCommand('claude'),
    DUGOUT_CODEX_COMMAND: demoAgentCommand('codex'),
  })
  page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }, size) => {
    BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height)
  }, WINDOW_SIZE)

  // A short, fixed folder, because the status bar shows the project's full path.
  const parent = realpathSync(PROJECTS_DIR)
  for (const name of ['web', 'api', 'docs'] as const) {
    await addProjectFolder(app, page, createDemoProject(parent, name))
  }
  await startBackgroundAgents()
  await projectTab('web').click()
  await installCursor()

  const recorder = new FrameRecorder(page, FRAMES_DIR)
  recorder.start()
  try {
    await playStoryboard()
  } finally {
    await recorder.stop()
    await app.close()
  }
})
