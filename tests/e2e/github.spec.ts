import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'
import { gitHubTestEnv, startGitHubStub, STUB_TOKEN, STUB_USER_CODE } from './githubStub'
import {
  GIT_IDENTITY,
  launchApp,
  makeFakeClaude,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startGitHubStub>>
let userDataDir: string

async function start(env: Record<string, string>): Promise<void> {
  app = await launchApp(userDataDir, env)
  page = await app.firstWindow()
}

test.beforeEach(async () => {
  stub = await startGitHubStub()
  userDataDir = makeTempDir()
})

test.afterEach(async () => {
  await app.close()
  await stub.close()
})

const sidebar = () => page.getByRole('banner')

/** A repo on branch feat/login whose origin is the stub's octocat/app. */
function makeRepoWithPullRequest(baseUrl: string): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...GIT_IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('remote', 'add', 'origin', `${baseUrl}/octocat/app.git`)
  git('checkout', '-q', '-b', 'feat/login')
  return root
}

/** Everything the renderer gets back from GitHub calls, as one string to search. */
function gitHubResponsesInRenderer(): Promise<string> {
  return page.evaluate(async () => {
    const { dugout } = globalThis as unknown as { dugout: DugoutApi }
    const projects = await dugout.projects.list()
    if (!projects.ok) throw new Error(projects.error)
    const checkout = { projectId: projects.data[0]?.id ?? '' }
    const responses = await Promise.all([
      dugout.github.getState(),
      dugout.github.listRepos(),
      dugout.git.pullRequestStatus(checkout),
      dugout.git.pullRequestReviewThreads(checkout, 7),
      dugout.git.pullRequestFailingChecks(checkout, 7),
    ])
    return JSON.stringify(responses)
  })
}

test('signs in with the device flow, remembers the session, and signs out', async () => {
  // Arrange
  await start(gitHubTestEnv(stub.baseUrl))
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { openedUrls: string[] }).openedUrls = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })

  // Act: start sign-in and approve it "in the browser"
  await sidebar().getByRole('button', { name: 'Sign in to GitHub' }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign in to GitHub' })
  await expect(dialog.getByLabel('Sign-in code')).toHaveText(STUB_USER_CODE)
  await dialog.getByRole('button', { name: 'Open GitHub' }).click()

  // Assert: signed in; the verification page opened; the token never reached the renderer
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()
  await expect(dialog).toBeHidden()
  const opened = await app.evaluate(
    () => (globalThis as unknown as { openedUrls: string[] }).openedUrls,
  )
  expect(opened).toEqual([`${stub.baseUrl}/login/device`])
  const rendererState = await page.evaluate(async () =>
    JSON.stringify(await (globalThis as unknown as { dugout: DugoutApi }).dugout.github.getState()),
  )
  expect(rendererState).toContain('octocat')
  expect(rendererState).not.toContain(STUB_TOKEN)

  // The session survives a restart
  await app.close()
  await start(gitHubTestEnv(stub.baseUrl))
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()

  // Signing out forgets the stored token
  await sidebar().getByRole('button', { name: 'GitHub account octocat' }).click()
  await sidebar().getByRole('button', { name: 'Sign out of GitHub' }).click()
  await expect(sidebar().getByRole('button', { name: 'Sign in to GitHub' })).toBeVisible()
  expect(existsSync(join(userDataDir, 'github-token.bin'))).toBe(false)
})

test('explains the one-time setup when no OAuth app is configured', async () => {
  await start({ DUGOUT_GITHUB_CLIENT_ID: '', DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS: '1' })
  await sidebar().getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(page.getByRole('dialog', { name: 'Sign in to GitHub' })).toContainText(
    'Enable Device Flow',
  )
})

test('expiring tokens are renewed automatically, and a revoked session signs out', async () => {
  // Arrange: a stub that issues 1-second tokens with rotating refresh tokens
  await stub.close()
  stub = await startGitHubStub([{ name: 'gizmo', cloneUrl: '/tmp/gizmo.git' }], {
    expiringTokens: true,
  })
  await start(gitHubTestEnv(stub.baseUrl))
  await sidebar().getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()

  // Act + Assert: listing repos needs a fresh token, so it renews first
  await page.getByRole('button', { name: 'Clone repository…' }).click()
  const clone = page.getByRole('dialog', { name: 'Clone repository' })
  await expect(clone.getByRole('button', { name: /octocat\/gizmo/ })).toBeVisible()
  expect(stub.refreshCount()).toBeGreaterThanOrEqual(1)

  // The renewed session survives a restart (renewing again on start)
  await app.close()
  await start(gitHubTestEnv(stub.baseUrl))
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()

  // Once GitHub rejects the refresh token, the next GitHub call signs out with a clear reason
  stub.revokeRefreshToken()
  await page.getByRole('button', { name: 'Clone repository…' }).click()
  await expect(sidebar().getByRole('button', { name: 'Sign in to GitHub' })).toBeVisible()
  expect(existsSync(join(userDataDir, 'github-token.bin'))).toBe(false)
})

test('stays signed in while GitHub is unreachable and recovers when it is back', async () => {
  // Arrange: signed in, then GitHub goes down before the next launch
  await start(gitHubTestEnv(stub.baseUrl))
  await sidebar().getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()
  await app.close()
  stub.setUnavailable(true)

  // Act
  await start(gitHubTestEnv(stub.baseUrl))

  // Assert: still signed in, shown as offline, session kept
  await expect(
    sidebar().getByRole('button', { name: 'GitHub account octocat (offline)' }),
  ).toBeVisible()
  expect(existsSync(join(userDataDir, 'github-token.bin'))).toBe(true)

  // GitHub comes back and the Mac reports it is online: back to normal without signing in
  stub.setUnavailable(false)
  await page.evaluate(() =>
    (globalThis as unknown as EventTarget).dispatchEvent(new Event('online')),
  )
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()
})

test('the GitHub token reaches neither the renderer nor the agents', async () => {
  // Arrange: signed in, with a project whose branch has a pull request, and an agent on it
  await stub.close()
  stub = await startGitHubStub([{ name: 'gizmo', cloneUrl: '/tmp/gizmo.git' }], {
    pullRequest: {
      branch: 'feat/login',
      number: 7,
      title: 'Fix login',
      checks: [{ name: 'test', conclusion: 'failure', summary: '1 test failed', log: 'boom' }],
      reviewThreads: [
        {
          path: 'readme.md',
          line: 1,
          isResolved: false,
          comments: [{ author: 'ann', body: 'Typo.' }],
        },
      ],
    },
  })
  await start({
    ...GIT_IDENTITY,
    ...gitHubTestEnv(stub.baseUrl),
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
  })
  await sidebar().getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()
  await stubFolderPicker(app, makeRepoWithPullRequest(stub.baseUrl))
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  const output = await recordTerminalOutput(page)
  await page.getByRole('button', { name: /^New Claude agent/ }).click()
  await expect.poll(output).toContain('fake-claude ready')

  // Act
  const responses = await gitHubResponsesInRenderer()
  await page.locator('[data-active="true"] [data-testid="terminal"]').click()
  await page.keyboard.type('secret-env\n')

  // Assert: the calls worked, and carried no token
  expect(responses).toContain('octocat/gizmo')
  expect(responses).toContain('Fix login')
  expect(responses).toContain('Typo.')
  expect(responses).toContain('1 test failed')
  expect(responses).not.toContain(STUB_TOKEN)
  // The agent's only credential-like variable is its own hook token (variables the test runner
  // itself has, other than Dugout's, come from the developer's environment, not from Dugout).
  await expect.poll(output).toMatch(/secret-env=(\[.*?\])/)
  const names = JSON.parse(/secret-env=(\[.*?\])/.exec(await output())?.[1] ?? '[]') as string[]
  const ambient = new Set(Object.keys(process.env).filter((name) => !name.startsWith('DUGOUT_')))
  expect(names.filter((name) => !ambient.has(name))).toEqual(['DUGOUT_HOOK_TOKEN'])
})
