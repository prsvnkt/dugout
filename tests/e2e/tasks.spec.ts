import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { gitHubTestEnv, startGitHubStub } from './githubStub'
import {
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
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

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startGitHubStub>>
let repo: string

/** A repo whose origin is the stub's octocat/app, so its tasks are the stub's issues. */
function makeRepo(baseUrl: string): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  git('remote', 'add', 'origin', `${baseUrl}/octocat/app.git`)
  return root
}

test.beforeEach(async () => {
  stub = await startGitHubStub([], {
    issues: [
      {
        number: 1,
        title: 'Fix login',
        body: 'Times out after 5s',
        state: 'open',
        labels: [],
        comments: [],
      },
    ],
  })
  repo = makeRepo(stub.baseUrl)
  app = await launchApp(makeTempDir(), {
    ...IDENTITY,
    ...gitHubTestEnv(stub.baseUrl),
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_CODEX_COMMAND: makeFakeCodex(),
  })
  page = await app.firstWindow()
  await page.getByRole('banner').getByRole('button', { name: 'Sign in to GitHub' }).click()
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'GitHub account octocat' }),
  ).toBeVisible()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Add project' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('tab', { name: 'Tasks' }).click()
})

test.afterEach(async () => {
  await app.close()
  await stub.close()
})

const tasks = () => page.getByRole('complementary', { name: 'Tasks' })

test('shows the GitHub issues as tasks and creates new ones', async () => {
  await expect(tasks().getByRole('region', { name: 'To do' })).toContainText('Fix login')

  await tasks().getByRole('button', { name: 'New task' }).click()
  await tasks().getByLabel('Title').fill('Add dark mode')
  await tasks().getByRole('button', { name: 'Create task' }).click()

  await expect(tasks().getByRole('region', { name: 'To do' })).toContainText('Add dark mode')
  expect(stub.issues.map((issue) => issue.title)).toContain('Add dark mode')
})

test('starts an agent on a task, which the agent then updates through its tools', async () => {
  const output = await recordTerminalOutput(page)

  // Start agent from the task
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await tasks().getByRole('button', { name: 'Start agent' }).click()
  await tasks().getByRole('menuitem', { name: 'Claude', exact: true }).click()

  // A Claude pane for #1 in its own worktree, with the issue as its first prompt
  const pane = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('#1')
  await expect(pane).toContainText('⎇ dugout/1-fix-login')
  await expect.poll(output).toContain('prompt=You are working on GitHub issue #1: Fix login')

  // The task moved to In progress (on GitHub too)
  await expect(tasks().getByLabel('Status')).toHaveValue('in-progress')
  expect(stub.issues[0]?.labels).toContain('dugout:in-progress')

  // The agent comments on the task through Dugout's MCP tools
  await pane.getByTestId('terminal').click()
  await page.keyboard.type('agent-comment\n')
  await expect.poll(output, { timeout: 20_000 }).toContain('tool-result=')
  await expect
    .poll(() => stub.issues[0]?.comments.map((c) => c.body))
    .toContain('Progress from the agent')
})

test('a comment and a status change from the panel reach GitHub', async () => {
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await tasks().getByLabel('Add a comment').fill('Looking into it')
  await tasks().getByRole('button', { name: 'Comment' }).click()
  await expect(tasks().getByRole('list', { name: 'Comments' })).toContainText('Looking into it')

  await tasks().getByLabel('Status').selectOption('done')
  await expect.poll(() => stub.issues[0]?.state).toBe('closed')
})

test('runs Claude and Codex on one task and compares what each changed', async () => {
  const output = await recordTerminalOutput(page)
  await tasks().getByRole('button', { name: '#1 Fix login' }).click()
  await tasks().getByRole('button', { name: 'Start agent' }).click()
  await tasks().getByRole('menuitem', { name: 'Claude + Codex (compare)' }).click()

  // Two panes, each in its own worktree, both given the issue
  const panes = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(panes).toHaveCount(2)
  await expect(panes.nth(0)).toContainText('⎇ dugout/1-fix-login-claude')
  await expect(panes.nth(1)).toContainText('⎇ dugout/1-fix-login-codex')
  await expect.poll(output).toContain('fake-codex ready')

  // Codex reaches the task tools through its -c MCP override
  await panes.nth(1).getByTestId('terminal').click()
  await page.keyboard.type('agent-comment\nedit\n')
  await expect.poll(output, { timeout: 20_000 }).toContain('tool-result=')
  await panes.nth(0).getByTestId('terminal').click()
  await page.keyboard.type('edit\n')
  await expect.poll(() => output().then((text) => text.split('edited').length - 1)).toBe(2)

  // Compare lists each agent's files and diffs the shared one
  await tasks().getByRole('button', { name: 'Compare', exact: true }).click()
  const compare = page.getByRole('region', { name: 'Compare Claude and Codex' })
  await expect(compare.getByRole('button', { name: 'fake-claude.txt, Claude only' })).toBeVisible()
  await expect(compare.getByRole('button', { name: 'fake-codex.txt, Codex only' })).toBeVisible()
  await compare.getByRole('button', { name: 'shared.txt, both' }).click()
  await expect(compare.locator('.monaco-diff-editor')).toContainText('shared by fake-codex')
})
