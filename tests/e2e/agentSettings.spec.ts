import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  chooseNewAgentAction,
  clickMenuItem,
  launchApp,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
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
  await addProjectFolder(app, page, repo)
})

test.afterEach(async () => {
  await app.close()
})

const settings = () => page.getByRole('region', { name: 'Agent settings' })
const mcpJson = () => JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'))
/** The fake codex's line when it got Dugout's server and no project servers (the PTY adds \r). */
const ONLY_DUGOUT = 'mcp=dugout\r'
const withheldNotice = () =>
  page.getByRole('complementary', { name: 'Project MCP servers waiting for approval' }).last()

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
    'Claude, and Codex once approved',
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

  // Until approved, a new Codex pane gets only Dugout's own server, and says what it left out
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect.poll(output).toContain(ONLY_DUGOUT)
  const notice = withheldNotice()
  await expect(notice).toContainText(
    '1 project MCP server from .mcp.json is not shared with Codex until you approve it.',
  )
  await expect(notice).toContainText('https://docs.example.com/mcp')

  // Approved in Agent settings, the next Codex pane gets it next to Dugout's own
  await clickMenuItem(app, 'View', 'Agent Settings')
  const approval = settings().getByRole('region', { name: 'Approval for Codex' })
  await expect(approval.getByRole('listitem', { name: 'Server to approve docs' })).toContainText(
    'headers: Authorization',
  )
  await approval.getByRole('button', { name: 'Approve for Codex' }).click()
  await expect(approval).toContainText('Approved for Codex')
  await expect(settings().getByRole('listitem', { name: 'MCP server docs' })).toContainText(
    'Claude and Codex',
  )
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect.poll(output).toContain('mcp=dugout,docs')
})

test("approves a repo's committed .mcp.json from the Codex pane's notice", async () => {
  const hostile = { command: 'sh', args: ['-c', 'echo pwned'] }
  writeFileSync(join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { tools: hostile } }))
  const output = await recordTerminalOutput(page)

  await clickMenuItem(app, 'File', 'New Codex Agent')

  await expect.poll(output).toContain(ONLY_DUGOUT)
  const notice = withheldNotice()
  await expect(notice.getByRole('listitem', { name: 'Server to approve tools' })).toContainText(
    'sh -c echo pwned',
  )
  await notice.getByRole('button', { name: 'Approve for Codex' }).click()
  await expect(notice).toContainText('Approved. Restart this agent')
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect.poll(output).toContain('mcp=dugout,tools')

  // Changing the file takes the approval away again
  const changed = { ...hostile, args: ['-c', 'echo changed'] }
  writeFileSync(join(repo, '.mcp.json'), JSON.stringify({ mcpServers: { tools: changed } }))
  await clickMenuItem(app, 'File', 'New Codex Agent')
  await expect(page.getByRole('complementary', { name: /waiting for approval/ })).toHaveCount(2)
  await expect(withheldNotice()).toContainText('sh -c echo changed')
})

test('adds an MCP server from a preset in one click', async () => {
  await clickMenuItem(app, 'View', 'Agent Settings')
  const preset = settings().getByRole('listitem', { name: 'MCP preset GitHub' })
  await expect(preset).toContainText('Claude and Codex')

  await preset.getByRole('button', { name: 'Add GitHub' }).click()

  await expect(settings().getByRole('listitem', { name: 'MCP server github' })).toBeVisible()
  await expect(preset.getByRole('button', { name: 'Add GitHub' })).toBeDisabled()
  expect(mcpJson().mcpServers.github).toEqual({
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { Authorization: 'Bearer ${GITHUB_PAT}' },
  })
})

test('makes AGENTS.md the shared instructions', async () => {
  await chooseNewAgentAction(page, 'Agent settings')
  await settings().getByRole('button', { name: 'Make AGENTS.md the source' }).click()

  await expect(settings()).toContainText('CLAUDE.md imports AGENTS.md')
  expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe('# Rules\nUse pnpm.\n')
  expect(readFileSync(join(repo, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n\n## Claude-only notes\n')
  await expect(settings().getByRole('button', { name: 'Open AGENTS.md' })).toBeVisible()
})
