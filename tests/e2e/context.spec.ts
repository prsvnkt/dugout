import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
} from './helpers'

let app: ElectronApplication
let page: Page
let repo: string

test.beforeEach(async () => {
  repo = makeGitRepo('shop')
  mkdirSync(join(repo, 'src'))
  writeFileSync(join(repo, 'src', 'auth.ts'), 'export const auth = 1\n')
  app = await launchApp(makeTempDir(), { DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
  await addProjectFolder(app, page, repo)
})

test.afterEach(async () => {
  await app.close()
})

const contextView = () => page.getByRole('region', { name: 'Project context' })
const addForm = () => contextView().getByRole('form', { name: 'Add context' })
const entry = (title: string) => contextView().getByRole('listitem', { name: `Context ${title}` })
const sharedFile = (name: string) => join(repo, '.dugout', 'context', name)

async function openContext(): Promise<void> {
  await page.getByRole('button', { name: /^Project context/ }).click()
  await expect(contextView()).toBeVisible()
}

test('adds a shared note and a pinned file, which turns stale when the file changes', async () => {
  await openContext()
  await expect(contextView()).toContainText('No context yet')

  // A shared note becomes a markdown file in .dugout/context
  await addForm().getByLabel('Title').fill('Deploys')
  await addForm()
    .getByRole('textbox', { name: 'Text', exact: true })
    .fill('We deploy on **Fridays**.')
  await addForm().getByRole('button', { name: 'Add' }).click()
  await expect(entry('Deploys')).toContainText('Shared')
  expect(readFileSync(sharedFile('deploys.md'), 'utf8')).toContain('We deploy on **Fridays**.')
  await entry('Deploys').getByRole('button', { name: 'Show' }).click()
  await expect(entry('Deploys').locator('strong', { hasText: 'Fridays' })).toBeVisible()

  // A pinned file keeps a hash and is flagged once the file changes
  await addForm().getByRole('radio', { name: 'File or folder' }).check()
  await addForm().getByLabel('Title').fill('Auth')
  await addForm().getByLabel('Path in the project').fill('src/auth.ts')
  await addForm().getByRole('button', { name: 'Add' }).click()
  await expect(entry('Auth')).toContainText('src/auth.ts')
  await expect(entry('Auth')).not.toContainText('Changed since pinned')

  writeFileSync(join(repo, 'src', 'auth.ts'), 'export const auth = 2\n')
  await page.getByRole('tab', { name: 'Context' }).click()
  await page.getByRole('button', { name: 'Close Context' }).click()
  await openContext()
  await expect(entry('Auth')).toContainText('Changed since pinned')
  await entry('Auth').getByRole('button', { name: 'Mark as current' }).click()
  await expect(entry('Auth')).not.toContainText('Changed since pinned')
})

test('an agent proposes a note over MCP; it is shared only once approved', async () => {
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect.poll(output).toContain('fake-claude ready')

  // The agent proposes a note through the dugout MCP server
  await page.locator('[data-active="true"] [data-testid="terminal"]').click()
  await page.keyboard.type('agent-note\n')
  await expect.poll(output, { timeout: 20_000 }).toContain('tool-result=')
  expect(existsSync(sharedFile('tests-need-docker.md'))).toBe(false)

  // The rail shows it waiting; the user reads and approves it
  await page.getByRole('button', { name: 'Project context, 1 proposed' }).click()
  const proposal = contextView().getByRole('listitem', { name: 'Proposed note Tests need Docker' })
  await expect(proposal).toContainText('Proposed by Claude')
  await expect(proposal).toContainText('Start Docker before npm test.')
  await proposal.getByRole('button', { name: 'Approve and share' }).click()

  await expect(proposal).toBeHidden()
  await expect(entry('Tests need Docker')).toContainText('Shared')
  expect(readFileSync(sharedFile('tests-need-docker.md'), 'utf8')).toContain(
    'Start Docker before npm test.',
  )

  // Agents now see it in the index
  await page.locator('[data-active="true"] [data-testid="terminal"]').click()
  await page.keyboard.type('agent-context\n')
  await expect.poll(output, { timeout: 20_000 }).toContain('tests-need-docker')
})

test('builds a codemap with the default agent, headless', async () => {
  await openContext()
  await contextView().getByRole('button', { name: 'Build codemap' }).click()

  await expect(entry('Codemap')).toContainText('built by Claude', { timeout: 30_000 })
  expect(readFileSync(sharedFile('codemap.md'), 'utf8')).toContain(
    '- src/: the fake app (asked: Write',
  )
})
