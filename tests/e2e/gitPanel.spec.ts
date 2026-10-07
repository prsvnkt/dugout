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
  await expect(panel()).toContainText('Working tree clean')
  await expect(page.getByRole('contentinfo')).toContainText('⎇ main')

  // Act: an agent edits a file and creates another; the panel picks it up on its own
  writeFileSync(join(repo, 'readme.md'), 'hello\nfrom the agent\n')
  writeFileSync(join(repo, 'scratch.txt'), 'temporary\n')
  const changes = panel().getByRole('region', { name: 'Changes' })
  await expect(changes.getByRole('listitem')).toHaveCount(2, { timeout: 10_000 })

  // Review the diff: it opens in the center editor, not in the side panel
  await changes.getByRole('button', { name: /^Open diff of readme\.md/ }).click()
  const editor = page.getByRole('region', { name: 'Editor' })
  await expect(editor.getByRole('tab', { name: /readme\.md \(changes\)/ })).toBeVisible()
  await expect(editor).toContainText('from the agent')

  // Stage and commit
  await changes.getByRole('button', { name: 'Stage readme.md' }).click()
  const staged = panel().getByRole('region', { name: 'Staged Changes' })
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

test('with nothing staged, Commit & Push commits every change and pushes it', async () => {
  // Arrange: an edited file and a new one, nothing staged
  const { repo, remote } = makeRepoWithRemote()
  git(repo, 'push', '-q', '-u', 'origin', 'main')
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  writeFileSync(join(repo, 'readme.md'), 'hello\nedited\n')
  writeFileSync(join(repo, 'new.ts'), 'export {}\n')
  await expect(panel().getByRole('button', { name: 'Commit all 2 changes' })).toBeVisible({
    timeout: 10_000,
  })

  // Act
  await panel().getByRole('textbox', { name: 'Commit message' }).fill('feat: everything')
  await panel().getByRole('button', { name: 'More commit actions' }).click()
  await panel().getByRole('menuitem', { name: 'Commit & Push' }).click()

  // Assert: both files committed, pushed, tree clean
  await expect(panel()).toContainText('Working tree clean')
  expect(git(repo, 'show', '--name-only', '--format=', 'HEAD').trim().split('\n').sort()).toEqual([
    'new.ts',
    'readme.md',
  ])
  await expect
    .poll(() => git(remote, 'log', '-1', '--format=%s', 'main').trim())
    .toBe('feat: everything')
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

  await panel().getByRole('button', { name: 'Publish' }).click()

  await expect(panel().getByRole('alert')).toContainText('no remote named "origin"')
})

test('the git panel can be toggled from the menu', async () => {
  const { repo } = makeRepoWithRemote()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(panel()).toBeVisible()

  await clickMenuItem(app, 'View', 'Toggle Git Panel')
  await expect(panel()).toBeHidden()
  await clickMenuItem(app, 'View', 'Toggle Git Panel')
  await expect(panel()).toBeVisible()
})

test('Create PR pushes the branch and opens the compare page', async () => {
  // Arrange: origin fetches from GitHub but pushes to a local bare repo
  const { repo, remote } = makeRepoWithRemote()
  git(repo, 'remote', 'set-url', 'origin', 'git@github.com:acme/app.git')
  git(repo, 'remote', 'set-url', '--push', 'origin', remote)
  git(repo, 'checkout', '-q', '-b', 'feat/login')
  writeFileSync(join(repo, 'login.ts'), 'export {}\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'feat: login')
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { openedUrls: string[] }).openedUrls = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()

  // Act
  await panel().getByRole('button', { name: 'Create PR' }).click()

  // Assert
  const openedUrls = () =>
    app.evaluate(() => (globalThis as unknown as { openedUrls: string[] }).openedUrls)
  await expect
    .poll(openedUrls)
    .toEqual(['https://github.com/acme/app/compare/main...feat/login?expand=1'])
  expect(git(remote, 'log', '--format=%s', 'feat/login')).toContain('feat: login')
})

test('Create PR is not offered on the base branch', async () => {
  const { repo } = makeRepoWithRemote()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(panel()).toContainText('main')
  await expect(panel().getByRole('button', { name: 'Create PR' })).toBeHidden()
})
