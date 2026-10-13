import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import { launchApp, makeTempDir, stubFolderPicker, GIT_IDENTITY } from './helpers'

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startGitHubStub>>

test.beforeEach(async () => {
  stub = await startGitHubStub([], {
    pullRequest: {
      branch: 'feat/login',
      number: 7,
      title: 'Fix login',
      checks: [
        { name: 'lint', conclusion: 'success' },
        { name: 'test', conclusion: 'failure' },
      ],
    },
  })
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...GIT_IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('remote', 'add', 'origin', `${stub.baseUrl}/octocat/app.git`)
  git('checkout', '-q', '-b', 'feat/login')

  app = await launchApp(makeTempDir(), { ...GIT_IDENTITY, ...gitHubTestEnv(stub.baseUrl) })
  page = await app.firstWindow()
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as unknown as { openedUrls: string[] }).openedUrls = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await page.getByRole('banner').getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'GitHub account octocat' }),
  ).toBeVisible()
  await stubFolderPicker(app, root)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
})

test.afterEach(async () => {
  await app.close()
  await stub.close()
})

test('shows the branch pull request with its review and failing check', async () => {
  const panel = page.getByRole('complementary', { name: 'Source control' })
  const block = panel.getByRole('region', { name: 'Pull request' })

  await expect(block).toContainText('#7 Fix login')
  await expect(block).toContainText('Open')
  await expect(block).toContainText('✓ Approved')
  await expect(block).toContainText('Checks 1/2 (1 failing)')
  await expect(panel.getByRole('button', { name: 'Open PR' })).toBeVisible()
  await expect(panel.getByRole('button', { name: 'Create PR' })).toBeHidden()

  // Expand the checks and open the failing one on GitHub
  await block.getByRole('button', { name: /Checks 1\/2/ }).click()
  await block.getByRole('list', { name: 'Checks' }).getByRole('button', { name: /test/ }).click()
  await expect
    .poll(() => app.evaluate(() => (globalThis as unknown as { openedUrls: string[] }).openedUrls))
    .toEqual([`${stub.baseUrl}/octocat/app/runs/test`])
})
