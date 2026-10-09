import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import { launchApp, makeTempDir, recordTerminalOutput, stubFolderPicker } from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
}
const PREVIEW_URL = 'https://app-git-feat-login.vercel.app/'

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startGitHubStub>>

const openedUrls = () =>
  app.evaluate(() => (globalThis as unknown as { openedUrls: string[] }).openedUrls)

test.beforeEach(async () => {
  stub = await startGitHubStub([], {
    deployment: { branch: 'feat/login', environment: 'Preview', url: PREVIEW_URL },
  })
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('remote', 'add', 'origin', `${stub.baseUrl}/octocat/app.git`)
  git('checkout', '-q', '-b', 'feat/login')

  app = await launchApp(makeTempDir(), { ...IDENTITY, ...gitHubTestEnv(stub.baseUrl) })
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

function previewBlock() {
  return page
    .getByRole('complementary', { name: 'Source control' })
    .getByRole('region', { name: 'Preview' })
}

test('shows the branch preview deployment and opens it in the browser', async () => {
  const block = previewBlock()

  await expect(block).toContainText('Preview')
  await expect(block).toContainText('Ready')
  await block.getByRole('button', { name: 'Open preview' }).click()

  await expect.poll(openedUrls).toEqual([PREVIEW_URL])
})

test('runs the dev command in a new shell with a free PORT, then opens it', async () => {
  const block = previewBlock()
  const output = await recordTerminalOutput(page)

  // Set the project's dev command
  await block.getByRole('button', { name: 'Set dev command…' }).click()
  await block.getByRole('textbox', { name: 'Dev command' }).fill('echo "dev server on $PORT"')
  await block.getByRole('button', { name: 'Save' }).click()
  await expect(block).toContainText('echo "dev server on $PORT"')

  // Run it: a shell opens in the checkout and runs the command with PORT set
  await block.getByRole('button', { name: 'Run dev server' }).click()
  await expect(page.getByRole('region', { name: 'Shell terminal' })).toBeVisible()
  await expect.poll(output, { timeout: 15_000 }).toMatch(/dev server on \d{4,5}/)
  const port = /dev server on (\d{4,5})/.exec(await output())?.[1]
  await expect(block).toContainText(`localhost:${port}`)

  await block.getByRole('button', { name: 'Open dev server' }).click()
  await expect.poll(openedUrls).toEqual([`http://localhost:${port}/`])
})

test('refuses to open links that are not a reported preview or a local dev server', async () => {
  await expect(previewBlock()).toContainText('Ready')

  const results = await page.evaluate(async () => {
    const { preview } = (globalThis as unknown as { dugout: DugoutApi }).dugout
    return Promise.all(
      ['https://evil.example.com/', 'file:///etc/hosts', 'http://localhost:4100/admin'].map((url) =>
        preview.openUrl(url),
      ),
    )
  })

  expect(results.map((result) => result.ok)).toEqual([false, false, false])
  expect(await openedUrls()).toEqual([])
})
