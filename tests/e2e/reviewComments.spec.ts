import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
} from './helpers'

const IDENTITY = {
  GIT_AUTHOR_NAME: 'Dugout Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Dugout Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
}

let app: ElectronApplication
let page: Page

test.beforeEach(async () => {
  app = await launchApp(makeTempDir(), { ...IDENTITY, DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
})

test.afterEach(async () => {
  await app.close()
})

/** A repo with app.ts committed. */
function makeRepo(): string {
  const repo = makeGitRepo('app')
  writeFileSync(join(repo, 'app.ts'), "const greeting = 'hello'\nconst answer = 41\n")
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: repo, env: { ...process.env, ...IDENTITY } })
  git('add', '.')
  git('commit', '-qm', 'init')
  return repo
}

/** The agent changed line 2; open its diff from Source Control and comment on that line. */
async function commentOnChangedLine(repo: string, comment: string): Promise<void> {
  writeFileSync(join(repo, 'app.ts'), "const greeting = 'hello'\nconst answer = 42\n")
  const changes = page
    .getByRole('complementary', { name: 'Source control' })
    .getByRole('region', { name: 'Changes' })
  await changes.getByRole('button', { name: /^Open diff of app\.ts/ }).click({ timeout: 10_000 })
  const line = page.locator('.monaco-diff-editor .editor.modified .view-line', {
    hasText: 'answer = 42',
  })
  await line.click()
  await page.keyboard.press('Meta+Shift+M')
  const box = page.getByRole('textbox', { name: 'Review comment' })
  await expect(box).toBeFocused()
  await box.fill(comment)
  await box.press('Enter')
}

const reviewComments = () => page.getByRole('region', { name: 'Review comments' })

test('sends review comments from the diff to the agent working on the checkout', async () => {
  // Arrange: an agent running on the project
  const output = await recordTerminalOutput(page)
  const repo = makeRepo()
  await addProjectFolder(app, page, repo)
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect.poll(output).toContain('fake-claude ready')

  // Act
  await commentOnChangedLine(repo, 'Use the real answer here.')
  await expect(reviewComments()).toContainText('app.ts:2')
  await reviewComments().getByRole('button', { name: 'Send to agent' }).click()

  // Assert: one prompt with location, quoted code and comment arrives; the comment is cleared
  await expect.poll(output).toContain('1. app.ts:2')
  await expect.poll(output).toContain('> const answer = 42')
  await expect.poll(output).toContain('Use the real answer here.')
  await expect(reviewComments()).not.toContainText('Use the real answer here.')
})

test('offers to start an agent with the comments when none is open', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)
  const repo = makeRepo()
  await addProjectFolder(app, page, repo)

  // Act
  await commentOnChangedLine(repo, 'Explain this change.')
  await expect(reviewComments()).toContainText('No agent is open on this checkout.')
  await reviewComments().getByRole('button', { name: 'Start Claude with comments' }).click()

  // Assert: the new agent got the comments as its first prompt
  await expect.poll(output).toContain('prompt=Review comments on your changes')
  await expect(page.getByRole('region', { name: 'Claude Code terminal' })).toBeVisible()
})
