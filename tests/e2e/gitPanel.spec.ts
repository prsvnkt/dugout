import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { clickMenuItem, launchApp, makeTempDir, stubFolderPicker } from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Dugout Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Dugout Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...IDENTITY } })
}

/** A repo with one commit and an empty bare `origin`. */
function makeRepoWithRemote(): { repo: string; remote: string } {
  const remote = makeTempDir('dugout-remote-')
  git(remote, 'init', '-q', '--bare', '-b', 'main')
  const repo = join(makeTempDir(), 'app')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'readme.md'), 'hello\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  git(repo, 'remote', 'add', 'origin', remote)
  return { repo, remote }
}

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), IDENTITY)
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

const panel = () => page.getByRole('complementary', { name: 'Source control' })

test('reviews, stages, commits, publishes and discards changes', async () => {
  // Arrange
  const { repo, remote } = makeRepoWithRemote()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()
  await expect(panel()).toContainText('Working tree clean')
  await expect(page.getByRole('contentinfo')).toContainText('⎇ main')

  // Act: an agent edits a file and creates another; the panel picks it up on its own
  writeFileSync(join(repo, 'readme.md'), 'hello\nfrom the agent\n')
  writeFileSync(join(repo, 'scratch.txt'), 'temporary\n')
  const changes = panel().getByRole('region', { name: 'Changes' })
  await expect(changes.getByRole('listitem')).toHaveCount(2, { timeout: 10_000 })

  // Review the diff
  await changes.getByRole('button', { name: /^Open diff of readme\.md/ }).click()
  await expect(panel().getByRole('table', { name: 'Diff' })).toContainText('from the agent')

  // Stage and commit
  await changes.getByRole('button', { name: 'Stage readme.md' }).click()
  const staged = panel().getByRole('region', { name: 'Staged' })
  await expect(staged.getByRole('listitem')).toHaveCount(1)
  await panel().getByRole('textbox', { name: 'Commit message' }).fill('docs: agent note')
  await panel().getByRole('button', { name: 'Commit 1 staged' }).click()
  await expect(staged).toBeHidden()
  expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('docs: agent note')

  // Publish the branch to origin
  await panel().getByRole('button', { name: 'Publish' }).click()
  await expect(panel().getByRole('button', { name: 'Publish' })).toBeHidden()
  expect(git(remote, 'log', '--format=%s', 'main')).toContain('docs: agent note')

  // Discard the untracked file (needs a second click)
  await changes.getByRole('button', { name: 'Discard changes to scratch.txt' }).click()
  await changes.getByRole('button', { name: 'Confirm discard scratch.txt' }).click()
  await expect(panel()).toContainText('Working tree clean')
  expect(existsSync(join(repo, 'scratch.txt'))).toBe(false)
})

test('shows git errors in the panel', async () => {
  const repo = join(makeTempDir(), 'lonely')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'a.txt'), 'a\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()

  await panel().getByRole('button', { name: 'Publish' }).click()

  await expect(panel().getByRole('alert')).toContainText('no remote named "origin"')
})

test('the git panel can be toggled from the menu', async () => {
  const { repo } = makeRepoWithRemote()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()
  await expect(panel()).toBeVisible()

  await clickMenuItem(app, 'View', 'Toggle Git Panel')
  await expect(panel()).toBeHidden()
  await clickMenuItem(app, 'View', 'Toggle Git Panel')
  await expect(panel()).toBeVisible()
})
