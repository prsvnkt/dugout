import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'
import { gitHubTestEnv, startGitHubStub, STUB_TOKEN, STUB_USER_CODE } from './githubStub'
import { launchApp, makeTempDir } from './helpers'

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
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('menuitem', { name: /^Clone repository…/ }).click()
  const clone = page.getByRole('dialog', { name: 'Clone repository' })
  await expect(clone.getByRole('button', { name: /octocat\/gizmo/ })).toBeVisible()
  expect(stub.refreshCount()).toBeGreaterThanOrEqual(1)

  // The renewed session survives a restart (renewing again on start)
  await app.close()
  await start(gitHubTestEnv(stub.baseUrl))
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()

  // Once GitHub rejects the refresh token, the next GitHub call signs out with a clear reason
  stub.revokeRefreshToken()
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('menuitem', { name: /^Clone repository…/ }).click()
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
  await page.evaluate(() => globalThis.dispatchEvent(new Event('online')))
  await expect(sidebar().getByRole('button', { name: 'GitHub account octocat' })).toBeVisible()
})
