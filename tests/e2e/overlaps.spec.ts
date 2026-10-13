import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  chooseNewAgentAction,
  launchApp,
  makeFakeClaude,
  makeTempDir,
  stubFolderPicker,
  GIT_IDENTITY,
} from './helpers'

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_IDENTITY },
  })
}

function makeRepo(): string {
  const repo = join(makeTempDir(), 'app')
  mkdirSync(repo)
  git(repo, 'init', '-q', '-b', 'main')
  writeFileSync(join(repo, 'readme.md'), 'hello\n')
  git(repo, 'add', '.')
  git(repo, 'commit', '-qm', 'init')
  return repo
}

function worktreePaths(repo: string): string[] {
  return git(repo, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .map((line) => line.slice('worktree '.length))
    .filter((path) => path !== repo)
}

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), { ...GIT_IDENTITY, DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

const workspace = () => page.locator('[data-active="true"]')
const panes = () => workspace().getByRole('region', { name: /terminal$/ })
const overlapNote = (index: number) =>
  panes()
    .nth(index)
    .getByRole('note', { name: /^Overlapping changes/ })

test('agents in two worktrees that change the same file are flagged on both headers', async () => {
  // Arrange: two agents, each in its own worktree
  const repo = makeRepo()
  await stubFolderPicker(app, repo)
  await page.getByRole('button', { name: 'Add project…' }).click()
  await chooseNewAgentAction(workspace(), 'New Claude agent in worktree')
  await chooseNewAgentAction(workspace(), 'New Claude agent in worktree')
  await expect(panes()).toHaveCount(2)
  await expect.poll(() => worktreePaths(repo).length).toBe(2)
  const [first = '', second = ''] = worktreePaths(repo)

  // Act: each agent changes a file of its own, and both change the same one
  writeFileSync(join(first, 'a.ts'), 'export const a = 1\n')
  writeFileSync(join(second, 'b.ts'), 'export const b = 1\n')
  writeFileSync(join(first, 'shared.ts'), 'export const shared = "first"\n')
  writeFileSync(join(second, 'shared.ts'), 'export const shared = "second"\n')

  // Assert: each header names the other agent, and the tooltip lists the file
  for (const index of [0, 1]) {
    await expect(overlapNote(index)).toContainText(/also changed by Claude \(/, {
      timeout: 10_000,
    })
    await expect(overlapNote(index)).toHaveAttribute('title', /shared\.ts/)
    await expect(overlapNote(index)).not.toHaveAttribute('title', /a\.ts|b\.ts/)
  }

  // Advisory only: nothing was blocked, both worktrees keep their own version
  expect(git(first, 'status', '--porcelain')).toContain('shared.ts')
  expect(git(second, 'status', '--porcelain')).toContain('shared.ts')
})
