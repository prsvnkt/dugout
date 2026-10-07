import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, makeTempDir, stubFolderPicker } from './helpers'

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
  git(repo, 'branch', 'feat/older')
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'feat: only on main')
  return repo
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
const picker = () => page.getByRole('dialog', { name: 'Switch branch' })

async function openPicker(): Promise<void> {
  await panel()
    .getByRole('button', { name: /^Switch branch/ })
    .click()
  await expect(picker().getByRole('option').first()).toBeVisible()
}

async function addProject(repo: string): Promise<void> {
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByRole('contentinfo')).toContainText('⎇ main')
}

test('switches branches by searching, and creates new ones', async () => {
  const repo = makeRepo()
  await addProject(repo)

  // Switch: the branch list shows the last commit; typing filters, Enter switches
  await openPicker()
  await expect(picker().getByRole('option', { name: /feat\/older/ })).toContainText('init')
  await picker().getByRole('combobox', { name: 'Branch name' }).fill('older')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('contentinfo')).toContainText('⎇ feat/older')
  expect(git(repo, 'branch', '--show-current').trim()).toBe('feat/older')

  // Create at HEAD: a name no branch has is created with Enter
  await openPicker()
  await picker().getByRole('combobox', { name: 'Branch name' }).fill('feat/new')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('contentinfo')).toContainText('⎇ feat/new')

  // Create from another branch
  await openPicker()
  await picker().getByRole('combobox', { name: 'Branch name' }).fill('feat/from-main')
  await picker()
    .getByRole('option', { name: /Create “feat\/from-main” from/ })
    .click()
  await picker().getByRole('combobox', { name: 'Starting branch' }).fill('main')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('contentinfo')).toContainText('⎇ feat/from-main')
  expect(git(repo, 'log', '-1', '--format=%s').trim()).toBe('feat: only on main')
})

test('agent session branches are grouped last, behind a toggle', async () => {
  const repo = makeRepo()
  git(repo, 'branch', 'dugout/a1b2c3')
  git(repo, 'branch', 'dugout/d4e5f6')
  await addProject(repo)

  await openPicker()
  await expect(picker().getByRole('option', { name: /dugout\/a1b2c3/ })).toHaveCount(0)
  await picker().getByRole('option', { name: '2 agent session branches' }).click()

  await expect(picker().getByRole('option', { name: /dugout\/a1b2c3/ })).toBeVisible()
  await expect(picker().getByRole('group', { name: 'Agent sessions' })).toContainText(
    'dugout/d4e5f6',
  )
})

test('Escape closes the picker without changing branch', async () => {
  await addProject(makeRepo())

  await openPicker()
  await page.keyboard.press('Escape')

  await expect(picker()).toBeHidden()
  await expect(page.getByRole('contentinfo')).toContainText('⎇ main')
})
