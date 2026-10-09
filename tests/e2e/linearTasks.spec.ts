import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'
import { LINEAR_STUB_KEY, startLinearStub } from './linearStub'
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

let app: ElectronApplication
let page: Page
let stub: Awaited<ReturnType<typeof startLinearStub>>

/** A repo with one commit and no GitHub remote: its tasks can only come from Linear. */
function makeRepo(): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), '# app\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  return root
}

test.beforeEach(async () => {
  stub = await startLinearStub([
    {
      number: 1,
      title: 'Fix login',
      description: 'Times out after 5s.',
      stateId: 'state-todo',
      labels: [],
      priority: 2,
      comments: [],
    },
    {
      number: 2,
      title: 'Dark mode',
      description: '',
      stateId: 'state-review',
      labels: ['ui'],
      priority: 0,
      comments: [],
    },
  ])
  app = await launchApp(makeTempDir(), {
    ...IDENTITY,
    DUGOUT_LINEAR_BASE_URL: stub.baseUrl,
    DUGOUT_INSECURE_TOKEN_STORAGE_FOR_TESTS: '1',
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
  })
  page = await app.firstWindow()
  await stubFolderPicker(app, makeRepo())
  await page.getByRole('button', { name: 'Add project…' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await page.getByRole('button', { name: 'Show Tasks' }).click()
})

test.afterEach(async () => {
  await app.close()
  await stub.close()
})

const tasks = () => page.getByRole('complementary', { name: 'Tasks' })

test('switches a project to Linear, lists its issues and starts an agent on one', async () => {
  // Choose Linear and connect with an API key (a wrong one is refused)
  await tasks().getByRole('button', { name: 'Use Linear instead' }).click()
  const form = tasks().getByRole('region', { name: 'Task source' })
  await expect(form.getByRole('radio', { name: 'Linear' })).toBeChecked()
  await form.getByLabel('Linear API key').fill('lin_api_wrong')
  await form.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(form.getByRole('alert')).toContainText('did not accept the API key')
  await form.getByLabel('Linear API key').fill(LINEAR_STUB_KEY)
  await form.getByRole('button', { name: 'Connect', exact: true }).click()
  await expect(form).toContainText('Ada Lovelace')
  await expect(form.getByLabel('Linear team')).toHaveValue('ENG')
  await form.getByRole('button', { name: 'Use Linear' }).click()

  // The team's issues are the tasks, by their Linear identifiers and states
  await expect(tasks().getByRole('region', { name: 'To do' })).toContainText('Fix login')
  await expect(tasks().getByRole('button', { name: 'ENG-1 Fix login' })).toContainText('High')
  await expect(tasks().getByRole('region', { name: 'In review' })).toContainText('Dark mode')

  // The API key never reaches the renderer
  const seen = await page.evaluate(async () => {
    const { dugout } = globalThis as unknown as { dugout: DugoutApi }
    const projects = await dugout.projects.list()
    const projectId = projects.ok ? (projects.data[0]?.id ?? '') : ''
    return JSON.stringify([
      await dugout.linear.getState(),
      projects,
      await dugout.tasks.list(projectId),
    ])
  })
  expect(seen).toContain('Ada Lovelace')
  expect(seen).toContain('"teamKey":"ENG"')
  expect(seen).not.toContain(LINEAR_STUB_KEY)

  // Start agent works as for GitHub: the issue moves to In Progress in Linear
  const output = await recordTerminalOutput(page)
  await tasks().getByRole('button', { name: 'ENG-1 Fix login' }).click()
  const detail = page.getByRole('region', { name: 'Task ENG-1' })
  await expect(detail.getByRole('button', { name: 'Open in Linear' })).toBeVisible()
  await detail.getByRole('button', { name: 'Start agent' }).click()
  await detail.getByRole('menuitem', { name: 'Claude', exact: true }).click()
  const pane = page.locator('[data-active="true"]').getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('ENG-1')
  await expect.poll(output).toContain('prompt=You are working on task ENG-1: Fix login')
  await expect.poll(() => stub.issues[0]?.stateId).toBe('state-doing')

  // The agent's task tools reach Linear through Dugout, the same as for GitHub
  await pane.getByTestId('terminal').click()
  await page.keyboard.type('agent-comment\n')
  await expect
    .poll(() => stub.issues[0]?.comments.map((comment) => comment.body), { timeout: 20_000 })
    .toContain('Progress from the agent')
})
