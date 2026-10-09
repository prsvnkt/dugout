import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import { launchApp, makeTempDir, stubFolderPicker, GIT_IDENTITY } from './helpers'

/** A bare repository with one commit, usable as a clone URL (absolute path). */
function makeBareRepo(name: string): string {
  const work = join(makeTempDir(), 'work')
  mkdirSync(work)
  const run = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, env: { ...process.env, ...GIT_IDENTITY } })
  run(work, 'init', '-q', '-b', 'main')
  writeFileSync(join(work, 'readme.md'), `# ${name}\n`)
  run(work, 'add', '.')
  run(work, 'commit', '-qm', 'init')
  const bare = join(makeTempDir(), `${name}.git`)
  run(work, 'clone', '-q', '--bare', work, bare)
  return bare
}

let app: ElectronApplication
let page: Page
let userDataDir: string
let stub: Awaited<ReturnType<typeof startGitHubStub>> | null = null

test.beforeEach(() => {
  userDataDir = makeTempDir()
})

test.afterEach(async () => {
  await app.close()
  await stub?.close()
  stub = null
})

const cloneDialog = () => page.getByRole('dialog', { name: 'Clone repository' })

async function chooseParent(parent: string): Promise<void> {
  await stubFolderPicker(app, parent)
  await cloneDialog().getByRole('button', { name: 'Change…' }).click()
  await expect(cloneDialog()).toContainText(parent)
}

test('clones from a URL and opens it as a project', async () => {
  // Arrange
  app = await launchApp(userDataDir)
  page = await app.firstWindow()
  const remote = makeBareRepo('widget')
  const parent = makeTempDir('dugout-clones-')

  // Act
  await page.getByRole('button', { name: 'Clone repository…' }).click()
  await cloneDialog().getByRole('tab', { name: 'URL' }).click()
  await cloneDialog().getByLabel('Repository URL').fill(remote)
  await expect(cloneDialog().getByLabel('Folder name')).toHaveValue('widget')
  await chooseParent(parent)
  await cloneDialog().getByRole('button', { name: 'Clone', exact: true }).click()

  // Assert: cloned, added, selected, and the folder is remembered for next time
  await expect(cloneDialog()).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('navigation').getByRole('button', { name: /^widget/ })).toBeVisible()
  expect(readFileSync(join(parent, 'widget', 'readme.md'), 'utf8')).toBe('# widget\n')
  await expect(
    page
      .getByRole('complementary', { name: 'Explorer' })
      .getByRole('treeitem', { name: /^readme\.md/ }),
  ).toBeVisible()
  const settings = JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8'))
  expect(settings.cloneParentDir).toBe(parent)
})

test('clones one of your GitHub repositories after signing in', async () => {
  const remote = makeBareRepo('gadget')
  stub = await startGitHubStub([{ name: 'gadget', cloneUrl: remote }])
  app = await launchApp(userDataDir, gitHubTestEnv(stub.baseUrl))
  page = await app.firstWindow()
  const parent = makeTempDir('dugout-clones-')

  await page.getByRole('button', { name: 'Clone repository…' }).click()
  await cloneDialog().getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(page.getByRole('dialog', { name: 'Sign in to GitHub' })).toBeHidden({
    timeout: 10_000,
  })

  const repos = cloneDialog().getByRole('list', { name: 'Your repositories' })
  await cloneDialog().getByLabel('Search repositories').fill('gad')
  await repos.getByRole('button', { name: /octocat\/gadget/ }).click()
  await chooseParent(parent)
  await cloneDialog().getByRole('button', { name: 'Clone', exact: true }).click()

  await expect(cloneDialog()).toBeHidden({ timeout: 20_000 })
  expect(existsSync(join(parent, 'gadget', 'readme.md'))).toBe(true)
})

test('refuses to clone into a folder that already has files', async () => {
  app = await launchApp(userDataDir)
  page = await app.firstWindow()
  const parent = makeTempDir('dugout-clones-')
  mkdirSync(join(parent, 'widget'))
  writeFileSync(join(parent, 'widget', 'mine.txt'), 'keep me')

  await page.getByRole('button', { name: 'Clone repository…' }).click()
  await cloneDialog().getByRole('tab', { name: 'URL' }).click()
  await cloneDialog().getByLabel('Repository URL').fill(makeBareRepo('widget'))
  await chooseParent(parent)
  await cloneDialog().getByRole('button', { name: 'Clone', exact: true }).click()

  await expect(cloneDialog().getByRole('alert')).toContainText('not empty')
  expect(readFileSync(join(parent, 'widget', 'mine.txt'), 'utf8')).toBe('keep me')
})
