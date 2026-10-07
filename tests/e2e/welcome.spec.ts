import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import { launchApp, makeFakeClaude, makeTempDir } from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
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

const section = (name: string) => page.getByRole('region', { name })
const projectTab = (name: string) =>
  page.getByRole('navigation').getByRole('button', { name: new RegExp(`^${name}`) })

/** A repository with one commit, usable as a clone URL (absolute path). */
function makeRemote(name: string): string {
  const work = join(makeTempDir(), name)
  mkdirSync(work)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: work, env: { ...process.env, ...IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(work, 'readme.md'), `# ${name}\n`)
  git('add', '.')
  git('commit', '-qm', 'init')
  return work
}

test('adds a repository found on this Mac in one click', async () => {
  // Arrange: a fake home folder with a repo in ~/Developer
  const home = makeTempDir('dugout-home-')
  const repo = join(home, 'Developer', 'gizmo')
  mkdirSync(repo, { recursive: true })
  execFileSync('git', ['init', '-q'], { cwd: repo })
  app = await launchApp(userDataDir, { DUGOUT_HOME_DIR: home })
  page = await app.firstWindow()

  // Act
  const repos = section('On this Mac').getByRole('list', { name: 'Repositories on this Mac' })
  await repos.getByRole('button', { name: /gizmo/ }).click()

  // Assert: the project opens and the welcome screen goes away
  await expect(projectTab('gizmo')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Welcome to Dugout' })).toBeHidden()
})

test('says which agent CLIs are installed', async () => {
  app = await launchApp(userDataDir, {
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_CODEX_COMMAND: join(makeTempDir(), 'no-such-codex'),
  })
  page = await app.firstWindow()

  const agents = section('Agents')
  await expect(agents.getByRole('listitem').filter({ hasText: 'Claude Code' })).toContainText(
    'Installed',
    { timeout: 15_000 },
  )
  await expect(agents.getByRole('listitem').filter({ hasText: 'Codex CLI' })).toContainText(
    'Not found',
  )
  await expect(agents).toContainText('npm install -g @openai/codex')
})

test('asks to sign in to GitHub, then clones a repository in one click', async () => {
  // Arrange: a remote to clone, and a remembered clone folder
  stub = await startGitHubStub([{ name: 'gadget', cloneUrl: makeRemote('gadget') }])
  const parent = makeTempDir('dugout-clones-')
  writeFileSync(
    join(userDataDir, 'settings.json'),
    JSON.stringify({ version: 1, cloneParentDir: parent }),
  )
  app = await launchApp(userDataDir, gitHubTestEnv(stub.baseUrl))
  page = await app.firstWindow()

  // Act: sign in from the welcome screen's card, then pick a repository
  const github = section('GitHub')
  await expect(github).toContainText('Turn issues into tasks')
  await github.getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(page.getByRole('dialog', { name: 'Sign in to GitHub' })).toBeHidden({
    timeout: 10_000,
  })
  await github
    .getByRole('list', { name: 'Your GitHub repositories' })
    .getByRole('button', { name: /octocat\/gadget/ })
    .click()

  // Assert: cloned into the remembered folder and opened as a project
  await expect(projectTab('gadget')).toBeVisible({ timeout: 20_000 })
  expect(existsSync(join(parent, 'gadget', 'readme.md'))).toBe(true)
})
