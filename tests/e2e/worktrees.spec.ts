import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  chooseNewAgentAction,
  launchApp,
  makeFakeClaude,
  makeTempDir,
  stubFolderPicker,
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

function makeRepo(): string {
  const repo = join(makeTempDir(), 'app')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'readme.md'), 'hello\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  return repo
}

function worktreePaths(repo: string): string[] {
  return git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((path) => path !== repo)
}

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), { ...IDENTITY, DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

const panel = () => page.getByRole('complementary', { name: 'Source control' })
const workspace = () => page.locator('[data-active="true"]')

test('a worktree session isolates an agent and can be reviewed and removed', async () => {
  // Arrange
  const repo = makeRepo()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()

  // Act: start a worktree session
  await chooseNewAgentAction(workspace(), 'New Claude agent in worktree')

  // Assert: the pane runs on its own dugout/* branch in a separate checkout
  await expect(workspace().getByRole('region', { name: /terminal$/ })).toContainText('⎇ dugout/')
  await expect(workspace().getByRole('region', { name: /terminal$/ })).toContainText('Ready')
  const [worktree] = worktreePaths(repo)
  expect(worktree).toBeDefined()
  const worktreePath = worktree ?? ''

  // The agent edits a file in its worktree; the panel (following the pane) shows it
  writeFileSync(join(worktreePath, 'feature.ts'), 'export const feature = 1\n')
  await expect(panel().getByRole('region', { name: 'Changes' })).toContainText('feature.ts', {
    timeout: 10_000,
  })
  await expect(page.getByRole('contentinfo')).toContainText('⎇ dugout/')

  // The main checkout is untouched
  await panel().getByRole('radio', { name: 'Main checkout' }).click()
  await expect(panel()).toContainText('Working tree clean')
  expect(git(repo, 'status', '--porcelain')).toBe('')

  // Removing a worktree with uncommitted work is refused and keeps the pane
  await panel()
    .getByRole('radio', { name: /^Worktree · dugout\// })
    .click()
  await panel().getByRole('button', { name: 'Remove worktree' }).click()
  await panel().getByRole('button', { name: 'Click again to remove' }).click()
  await expect(workspace().getByRole('alert')).toContainText(/modified or untracked/)
  await expect(workspace().getByRole('region', { name: /terminal$/ })).toHaveCount(1)

  // Once clean, it is removed along with its pane
  rmSync(join(worktreePath, 'feature.ts'))
  await panel().getByRole('button', { name: 'Remove worktree' }).click()
  await panel().getByRole('button', { name: 'Click again to remove' }).click()
  await expect(workspace().getByRole('region', { name: /terminal$/ })).toHaveCount(0)
  expect(worktreePaths(repo)).toEqual([])
  expect(existsSync(worktreePath)).toBe(false)
})
