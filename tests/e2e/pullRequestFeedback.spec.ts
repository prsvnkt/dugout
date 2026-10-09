import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import {
  launchApp,
  makeFakeClaude,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'T',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 'T',
  GIT_COMMITTER_EMAIL: 't@example.com',
}

const LOG = [
  '2026-10-09T10:00:00.0000000Z ##[group]Run npm test',
  '2026-10-09T10:00:01.0000000Z FAIL src/login.test.ts',
  '2026-10-09T10:00:01.5000000Z Expected 200, got 500',
  '2026-10-09T10:00:02.0000000Z ##[error]Process completed with exit code 1.',
  '2026-10-09T10:00:03.0000000Z Post job cleanup.',
].join('\n')

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
        {
          name: 'test',
          conclusion: 'failure',
          summary: '1 test failed',
          annotations: [{ path: 'src/login.ts', line: 9, message: 'Login returns 500' }],
          log: LOG,
        },
      ],
      reviewThreads: [
        {
          path: 'src/login.ts',
          line: 4,
          isResolved: false,
          comments: [
            { author: 'ann', body: 'Handle the empty password.' },
            { author: 'bob', body: 'And trim it.' },
          ],
        },
        {
          path: 'readme.md',
          line: 1,
          isResolved: true,
          comments: [{ author: 'ann', body: 'Already fixed typo.' }],
        },
      ],
    },
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

  app = await launchApp(makeTempDir(), {
    ...IDENTITY,
    ...gitHubTestEnv(stub.baseUrl),
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
  })
  page = await app.firstWindow()
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

const pullRequestBlock = () =>
  page
    .getByRole('complementary', { name: 'Source control' })
    .getByRole('region', { name: 'Pull request' })

test('sends the unresolved review comments to the agent on the branch', async () => {
  // Arrange: an agent running on the checkout
  const output = await recordTerminalOutput(page)
  await page.getByRole('button', { name: /^New Claude agent/ }).click()
  await expect.poll(output).toContain('fake-claude ready')

  // Act
  await pullRequestBlock().getByRole('button', { name: 'Address review comments' }).click()

  // Assert: one prompt with the open thread only, and a confirmation
  await expect(pullRequestBlock().getByRole('status')).toHaveText(
    'Sent 1 unresolved review thread to the agent.',
  )
  await expect.poll(output).toContain('Unresolved review comments on pull request #7')
  await expect.poll(output).toContain('1. src/login.ts:4')
  await expect.poll(output).toContain('ann: Handle the empty password.')
  await expect.poll(output).toContain('bob: And trim it.')
  expect(await output()).not.toContain('Already fixed typo.')
})

test('sends the failing check’s annotations and log tail to the agent', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)
  await page.getByRole('button', { name: /^New Claude agent/ }).click()
  await expect.poll(output).toContain('fake-claude ready')

  // Act
  await pullRequestBlock().getByRole('button', { name: 'Fix failing CI' }).click()

  // Assert
  await expect(pullRequestBlock().getByRole('status')).toHaveText(
    'Sent 1 failing check to the agent.',
  )
  await expect.poll(output).toContain('CI is failing on pull request #7')
  await expect.poll(output).toContain('1. test: 1 test failed')
  await expect.poll(output).toContain('- src/login.ts:9 (failure): Login returns 500')
  await expect.poll(output).toContain('Expected 200, got 500')
  await expect.poll(output).toContain('Error: Process completed with exit code 1.')
  expect(await output()).not.toContain('Post job cleanup')
})

test('starts the default agent with the review comments when none is open', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)

  // Act
  await pullRequestBlock().getByRole('button', { name: 'Address review comments' }).click()

  // Assert: the new agent got them as its first prompt
  await expect.poll(output).toContain('prompt=Unresolved review comments on pull request #7')
  await expect(page.getByRole('region', { name: 'Claude Code terminal' })).toBeVisible()
})
