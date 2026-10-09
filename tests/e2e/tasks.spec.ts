import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import {
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
  GIT_IDENTITY,
} from './helpers'

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startGitHubStub>>
let repo: string

/** A repo whose origin is the stub's octocat/app, so its tasks are the stub's issues. */
function makeRepo(baseUrl: string): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...GIT_IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('remote', 'add', 'origin', `${baseUrl}/octocat/app.git`)
  return root
}

test.beforeEach(async () => {
  stub = await startGitHubStub([], {
    issues: [
      {
        number: 1,
        title: 'Fix login',
        body: '## Steps\n\n- Open the app\n- [x] Sign in\n\nTimes out after `5s`. <script>window.hacked = true</script>',
        state: 'open',
        labels: [],
        comments: [],
      },
    ],
  })
  repo = makeRepo(stub.baseUrl)
  app = await launchApp(makeTempDir(), {
    ...GIT_IDENTITY,
    ...gitHubTestEnv(stub.baseUrl),
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_CODEX_COMMAND: makeFakeCodex(),
    // Where the fake Claude writes its transcripts (a stand-in for ~/.claude).
    CLAUDE_CONFIG_DIR: makeTempDir('dugout-claude-'),
  })
  page = await app.firstWindow()
  await page.getByRole('banner').getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'GitHub account octocat' }),
  ).toBeVisible()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'Show Tasks' }).click()
})

test.afterEach(async () => {
  await app.close()
  await stub.close()
})

const tasks = () => page.getByRole('complementary', { name: 'Tasks' })
/** The task's editor tab, which opens in the center when a task card is clicked. */
const detail = () => page.getByRole('region', { name: 'Task #1' })

test('shows the GitHub issues as tasks and creates new ones', async () => {
  await expect(tasks().getByRole('region', { name: 'To do' })).toContainText('Fix login')

  await tasks().getByRole('button', { name: 'New task' }).click()
  await tasks().getByLabel('Title').fill('Add dark mode')
  await tasks().getByRole('button', { name: 'Create task' }).click()

  await expect(tasks().getByRole('region', { name: 'To do' })).toContainText('Add dark mode')
  expect(stub.issues.map((issue) => issue.title)).toContain('Add dark mode')
})

test('opens a task in an editor tab with its description rendered as markdown', async () => {
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()

  await expect(page.getByRole('tab', { name: '#1 Fix login' })).toBeVisible()
  const description = detail().getByRole('article', { name: 'Description' })
  await expect(description.getByRole('heading', { name: 'Steps' })).toBeVisible()
  await expect(description.getByRole('listitem').first()).toHaveText('Open the app')
  await expect(description.getByRole('checkbox')).toBeChecked()
  await expect(description.locator('code')).toHaveText('5s')
  await expect(description).not.toContainText('##')
  expect(await page.evaluate(() => 'hacked' in globalThis)).toBe(false)

  // The list stays in the panel, marking the open task; Enter opens it from the keyboard
  await expect(tasks().getByRole('button', { name: '#1 Fix login' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.getByRole('button', { name: 'Close #1 Fix login' }).click()
  await expect(detail()).toBeHidden()
  await tasks().getByLabel('Search tasks').focus()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(detail().getByRole('heading', { name: 'Steps' })).toBeVisible()
})

test('starts an agent on a task, which the agent then updates through its tools', async () => {
  const output = await recordTerminalOutput(page)

  // Start agent from the task
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await detail().getByRole('button', { name: 'Start agent' }).click()
  await detail().getByRole('menuitem', { name: 'Claude', exact: true }).click()

  // A Claude pane for #1 in its own worktree, with the issue as its first prompt
  const pane = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('#1')
  await expect(pane).toContainText('⎇ dugout/1-fix-login')
  await expect.poll(output).toContain('prompt=You are working on task #1: Fix login')

  // The task moved to In progress (on GitHub too)
  await expect(detail().getByLabel('Status')).toHaveValue('in-progress')
  await expect(tasks().getByRole('region', { name: 'In progress' })).toContainText('Claude')
  expect(stub.issues[0]?.labels).toContain('dugout:in-progress')

  // The agent comments on the task through Dugout's MCP tools
  await pane.getByTestId('terminal').click()
  await page.keyboard.type('agent-comment\n')
  await expect.poll(output, { timeout: 20_000 }).toContain('tool-result=')
  await expect
    .poll(() => stub.issues[0]?.comments.map((c) => c.body))
    .toContain('Progress from the agent')
})

test('a comment and a status change from the panel reach GitHub', async () => {
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await detail().getByLabel('Add a comment').fill('Looking into **it**')
  await detail().getByRole('button', { name: 'Comment' }).click()
  const comments = detail().getByRole('list', { name: 'Comments' })
  await expect(comments.locator('strong', { hasText: 'it' })).toBeVisible()

  await detail().getByLabel('Status').selectOption('done')
  await expect.poll(() => stub.issues[0]?.state).toBe('closed')
})

test('runs Claude and Codex on one task and compares what each changed', async () => {
  const output = await recordTerminalOutput(page)
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await detail().getByRole('button', { name: 'Start agent' }).click()
  await detail().getByRole('menuitem', { name: 'Claude + Codex (compare)' }).click()

  // Two panes, each in its own worktree, both given the issue
  const panes = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(panes).toHaveCount(2)
  await expect(panes.nth(0)).toContainText('⎇ dugout/1-fix-login-claude')
  await expect(panes.nth(1)).toContainText('⎇ dugout/1-fix-login-codex')
  await expect.poll(output).toContain('fake-codex ready')

  // Codex reaches the task tools through its -c MCP override
  await panes.nth(1).getByTestId('terminal').click()
  await page.keyboard.type('agent-comment\nedit\n')
  await expect.poll(output, { timeout: 20_000 }).toContain('tool-result=')
  await panes.nth(0).getByTestId('terminal').click()
  await page.keyboard.type('edit\n')
  await expect.poll(() => output().then((text) => text.split('edited').length - 1)).toBe(2)

  // Compare lists each agent's files and diffs the shared one
  await detail().getByRole('button', { name: 'Compare', exact: true }).click()
  const compare = page.getByRole('region', { name: 'Compare Claude and Codex' })
  await expect(compare.getByRole('button', { name: 'fake-claude.txt, Claude only' })).toBeVisible()
  await expect(compare.getByRole('button', { name: 'fake-codex.txt, Codex only' })).toBeVisible()
  await compare.getByRole('button', { name: 'shared.txt, both' }).click()
  await expect(compare.locator('.monaco-diff-editor')).toContainText('shared by fake-codex')
})

test("a task tab opens the timeline of each agent's session on it", async () => {
  // Arrange: a Claude agent on the task does some work
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await detail().getByRole('button', { name: 'Start agent' }).click()
  await detail().getByRole('menuitem', { name: 'Claude', exact: true }).click()
  const pane = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('Ready')
  await pane.getByTestId('terminal').click()
  await page.keyboard.type('work\n')

  // Act
  await detail().getByRole('button', { name: 'Claude timeline' }).click()

  // Assert: a timeline tab named after the agent and the task
  await expect(page.getByRole('tab', { name: 'Timeline · Claude · #1' })).toBeVisible()
  const steps = page.getByRole('region', { name: 'Session timeline' }).getByRole('list', {
    name: 'Steps',
  })
  await expect(steps).toContainText('Fix the login bug')
})

/** The setup starts a login shell of its own before the agent's, so allow for both. */
const SETUP_THEN_AGENT_MS = 30_000

test('Start agent sets up each task worktree before its agent starts', async () => {
  // Arrange: a local file to copy, and a setup that proves it ran in each worktree
  writeFileSync(join(repo, '.env'), 'TOKEN=local\n')
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'View', 'Agent Settings')
  const setup = page.getByRole('form', { name: 'Worktree setup' })
  await setup.getByLabel('Files to copy').fill('.env')
  await setup.getByLabel('Setup command').fill('cp .env .env.from-setup')
  await setup.getByRole('button', { name: 'Save worktree setup' }).click()
  await expect(setup.getByRole('status')).toContainText('Saved')

  // Act
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await detail().getByRole('button', { name: 'Start agent' }).click()
  await detail().getByRole('menuitem', { name: 'Claude + Codex (compare)' }).click()

  // Assert: both agents start after their setup, each in a worktree that has the files
  await expect.poll(output, { timeout: SETUP_THEN_AGENT_MS }).toContain('fake-codex ready')
  const panes = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(panes.nth(0)).toContainText('Ready', { timeout: SETUP_THEN_AGENT_MS })
  expect((await output()).split('Worktree setup: cp .env').length - 1).toBe(2)
  const worktrees = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((line) => line.startsWith('worktree ') && !line.endsWith(repo))
    .map((line) => line.slice('worktree '.length))
  expect(worktrees).toHaveLength(2)
  for (const worktree of worktrees) {
    expect(readFileSync(join(worktree, '.env.from-setup'), 'utf8')).toBe('TOKEN=local\n')
  }
})
