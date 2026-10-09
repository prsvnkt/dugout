import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import {
  chooseNewAgentAction,
  launchApp,
  makeFakeClaude,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
}

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startGitHubStub>>
let userDataDir: string
let fakeClaude: string

/** A repo whose origin is the stub's octocat/app, so its tasks are the stub's issues. */
function makeRepo(baseUrl: string): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('remote', 'add', 'origin', `${baseUrl}/octocat/app.git`)
  return root
}

const issue = (number: number, title: string) => ({
  number,
  title,
  body: '',
  state: 'open' as const,
  labels: [],
  comments: [],
})

async function start(): Promise<void> {
  app = await launchApp(userDataDir, {
    ...IDENTITY,
    ...gitHubTestEnv(stub.baseUrl),
    DUGOUT_CLAUDE_COMMAND: fakeClaude,
  })
  page = await app.firstWindow()
}

test.beforeEach(async () => {
  stub = await startGitHubStub([], {
    issues: [issue(1, 'Fix login'), issue(2, 'Add dark mode'), issue(3, 'Speed up search')],
  })
  userDataDir = makeTempDir()
  fakeClaude = makeFakeClaude()
  await start()
  await page.getByRole('banner').getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'GitHub account octocat' }),
  ).toBeVisible()
  await stubFolderPicker(app, makeRepo(stub.baseUrl))
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()

  // One agent at a time
  await chooseNewAgentAction(page, 'Agent settings')
  await page
    .getByRole('region', { name: 'Agent settings' })
    .getByLabel('Max agents at once')
    .selectOption('1')
  await page.getByRole('button', { name: 'Show Tasks' }).click()
})

test.afterEach(async () => {
  await app.close()
  await stub.close()
})

const tasks = () => page.getByRole('complementary', { name: 'Tasks' })
const queue = () => tasks().getByRole('region', { name: 'Queue' })
const panes = () => page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })

/** Opens the task's tab and chooses an agent from its "Start agent" or "Queue" menu. */
async function chooseAgent(number: number, title: string, menu: 'Start agent' | 'Queue') {
  await tasks()
    .getByRole('button', { name: `#${number} ${title}` })
    .click()
  const detail = page.getByRole('region', { name: `Task #${number}` })
  await detail.getByRole('button', { name: menu, exact: true }).click()
  await detail.getByRole('menuitem', { name: 'Claude', exact: true }).click()
}

test('starts the next queued task once the agent before it is done', async () => {
  const output = await recordTerminalOutput(page)

  // Queue two tasks: the first starts at once, the second waits for its slot
  await chooseAgent(1, 'Fix login', 'Queue')
  await expect.poll(output).toContain('prompt=You are working on task #1: Fix login')
  await chooseAgent(2, 'Add dark mode', 'Queue')
  await expect(queue().getByRole('listitem')).toHaveText([/Add dark mode/])
  await expect(queue().getByRole('status')).toHaveText('1 of 1 agents busy')
  // At Ready a new agent has not got going yet, so it still holds the slot
  await expect(panes()).toContainText('Ready')
  await expect(panes()).toHaveCount(1)

  // The first agent works, then finishes
  await panes().getByTestId('terminal').click()
  await page.keyboard.type('prompt\n')
  await expect(panes()).toContainText('Working')
  await expect(queue()).toBeVisible()
  await page.keyboard.type('stop\n')

  // The second task starts in its own worktree, through the same path as "Start agent"
  await expect.poll(output).toContain('prompt=You are working on task #2: Add dark mode')
  await expect(panes()).toHaveCount(2)
  await expect(panes().nth(1)).toContainText('⎇ dugout/2-add-dark-mode')
  await expect(queue()).toBeHidden()
})

test('the queue keeps its order across a restart, and starts nothing past the limit', async () => {
  // An agent started by hand takes the only slot, so queued tasks wait
  await chooseAgent(1, 'Fix login', 'Start agent')
  await expect(panes()).toContainText('Ready')
  await panes().getByTestId('terminal').click()
  await page.keyboard.type('prompt\n')
  await expect(panes()).toContainText('Working')
  await chooseAgent(2, 'Add dark mode', 'Queue')
  await chooseAgent(3, 'Speed up search', 'Queue')
  await expect(queue().getByRole('listitem')).toHaveText([/Add dark mode/, /Speed up search/])

  // Reorder: #3 first
  await queue().getByRole('button', { name: 'Move #3 up' }).click()
  await expect(queue().getByRole('listitem')).toHaveText([/Speed up search/, /Add dark mode/])
  await expect(panes()).toHaveCount(1)
  // Give the debounced layout save time to run.
  await page.waitForTimeout(1_000)

  // Restart: the restored agent comes back at Ready, which frees its slot for #3 only
  await app.close()
  await start()
  const output = await recordTerminalOutput(page)
  await expect.poll(output).toContain('prompt=You are working on task #3: Speed up search')
  await expect(panes()).toHaveCount(2)
  await page.getByRole('button', { name: 'Show Tasks' }).click()
  await expect(queue().getByRole('listitem')).toHaveText([/Add dark mode/])
  await expect(queue().getByRole('status')).toHaveText('1 of 1 agents busy')
  await expect(panes()).toHaveCount(2)
})
