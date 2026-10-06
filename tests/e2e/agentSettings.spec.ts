import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
  openAddProjectFromTabs,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page
let repo: string

test.beforeEach(async () => {
  repo = makeGitRepo('app')
  writeFileSync(join(repo, 'CLAUDE.md'), '# Rules\nUse pnpm.\n')
  execFileSync('git', ['add', '.'], { cwd: repo })
  app = await launchApp(makeTempDir(), { DUGOUT_CODEX_COMMAND: makeFakeCodex() })
  page = await app.firstWindow()
  await stubFolderPicker(app, repo)
  await openAddProjectFromTabs(page)
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test.afterEach(async () => {
  await app.close()
})

const settings = () => page.getByRole('region', { name: 'Agent settings' })
const mcpJson = () => JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'))

test('edits .mcp.json servers that Codex panes then receive', async () => {
  await clickMenuItem(app, 'View', 'Agent Settings')
  await expect(settings()).toContainText('No project MCP servers yet')

  // An HTTP server with its token from the environment
  await settings().getByRole('button', { name: 'Add server' }).click()
  const form = settings().getByRole('form', { name: 'MCP server' })
  await form.getByLabel('Name', { exact: true }).fill('docs')
  await form.getByLabel('Type').selectOption('http')
  await form.getByLabel('URL').fill('https://docs.example.com/mcp')
  await form.getByLabel('Headers').fill('Authorization: Bearer ${DOCS_TOKEN}')
  await form.getByRole('button', { name: 'Save server' }).click()

  await expect(settings().getByRole('listitem', { name: 'MCP server docs' })).toContainText(
    'Claude and Codex',
  )
  expect(mcpJson().mcpServers.docs).toEqual({
    type: 'http',
    url: 'https://docs.example.com/mcp',
    headers: { Authorization: 'Bearer ${DOCS_TOKEN}' },
  })

  // A secret written out in full is flagged before saving
  await settings().getByRole('button', { name: 'Add server' }).click()
  await form.getByLabel('Name', { exact: true }).fill('local')
  await form.getByLabel('Command').fill('run-local')
  await form.getByLabel('Environment').fill('API_KEY=sk-123')
  await expect(form.getByRole('note')).toContainText('API_KEY looks like a secret')
  await form.getByRole('button', { name: 'Cancel' }).click()

  // A new Codex pane gets the project's server next to Dugout's own
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'File', 'New Codex Pane')
  await expect.poll(output).toContain('mcp=dugout,docs')
})

test('makes AGENTS.md the shared instructions', async () => {
  await page.getByRole('button', { name: 'Agent settings' }).click()
  await settings().getByRole('button', { name: 'Make AGENTS.md the source' }).click()

  await expect(settings()).toContainText('CLAUDE.md imports AGENTS.md')
  expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe('# Rules\nUse pnpm.\n')
  expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  await expect(settings().getByRole('button', { name: 'Open AGENTS.md' })).toBeVisible()
})
