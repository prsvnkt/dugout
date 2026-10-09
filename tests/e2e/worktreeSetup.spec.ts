import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  chooseNewAgentAction,
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
} from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Dugout Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Dugout Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENTITY } })
}

/** Dugout's worktrees of `repo`, newest last. */
function worktreePaths(repo: string): string[] {
  return git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((path) => path !== repo)
}

let app: ElectronApplication
let page: Page
let repo: string

test.beforeEach(async () => {
  repo = makeGitRepo('app')
  writeFileSync(join(repo, '.gitignore'), '.env*\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  // A local file a clean checkout would not have.
  writeFileSync(join(repo, '.env'), 'API_URL=http://localhost\n')
  app = await launchApp(makeTempDir(), { ...IDENTITY, DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
  await addProjectFolder(app, page, repo)
})

test.afterEach(async () => {
  await app.close()
})

const workspace = () => page.locator('[data-active="true"]')
const setupForm = () => page.getByRole('form', { name: 'Worktree setup' })

async function saveSetup(copy: string, command: string): Promise<void> {
  await setupForm().getByLabel('Files to copy').fill(copy)
  await setupForm().getByLabel('Setup command').fill(command)
  await setupForm().getByRole('button', { name: 'Save worktree setup' }).click()
  await expect(setupForm().getByRole('status')).toContainText('Saved')
}

test('copies local files and runs the setup before a worktree agent starts', async () => {
  // Arrange: the copy proves the command runs in the new worktree, after the files arrive
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'View', 'Agent Settings')
  await saveSetup('.env*', 'cp .env .env.from-setup')

  // Act
  await chooseNewAgentAction(workspace(), 'New Claude agent in worktree')

  // Assert: the setup showed in the agent's terminal, then the agent started
  const pane = workspace().getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('Ready')
  expect(await output()).toContain('Worktree setup: cp .env .env.from-setup')
  const [worktree = ''] = worktreePaths(repo)
  expect(readFileSync(join(worktree, '.env'), 'utf8')).toBe('API_URL=http://localhost\n')
  expect(readFileSync(join(worktree, '.env.from-setup'), 'utf8')).toBe('API_URL=http://localhost\n')
})

test('shows a failed setup in the terminal and does not start the agent', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'View', 'Agent Settings')
  await saveSetup('', 'echo installing; exit 3')

  // Act
  await chooseNewAgentAction(workspace(), 'New Claude agent in worktree')

  // Assert
  const pane = workspace().getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('Exited (3)')
  await expect.poll(output).toContain('Worktree setup failed (exit code 3)')
  expect(await output()).toContain('installing')
})

test('refuses copy patterns that leave the repository', async () => {
  await clickMenuItem(app, 'View', 'Agent Settings')
  await setupForm().getByLabel('Files to copy').fill('../secrets/.env')
  await setupForm().getByRole('button', { name: 'Save worktree setup' }).click()
  await expect(setupForm().getByRole('alert')).toContainText('relative to the repository')
})
