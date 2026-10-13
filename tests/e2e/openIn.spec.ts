import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import type { DugoutApi } from '../../src/shared/api'
import {
  addProjectFolder,
  chooseNewAgentAction,
  launchApp,
  makeFakeClaude,
  makeTempDir,
  GIT_IDENTITY,
} from './helpers'

let app: ElectronApplication
let page: Page
let repo: string
let openLog: string

function makeRepo(): string {
  const root = join(makeTempDir(), 'app')
  mkdirSync(root)
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env: { ...process.env, ...GIT_IDENTITY } })
  git('init', '-q', '-b', 'main')
  writeFileSync(join(root, 'readme.md'), 'hello\n')
  git('add', '.')
  git('commit', '-qm', 'init')
  return root
}

/** A stand-in for macOS `open` that records each call's arguments, one JSON line per call. */
function makeFakeOpen(log: string): string {
  const path = join(makeTempDir('dugout-fake-open-'), 'open')
  const source = [
    `#!${process.execPath}`,
    `require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify(process.argv.slice(2)) + '\\n')`,
  ].join('\n')
  writeFileSync(path, source, { mode: 0o755 })
  return path
}

function openCalls(): string[][] {
  if (!existsSync(openLog)) return []
  return readFileSync(openLog, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as string[])
}

test.beforeEach(async () => {
  openLog = join(makeTempDir('dugout-open-log-'), 'calls.jsonl')
  app = await launchApp(makeTempDir(), {
    ...GIT_IDENTITY,
    DUGOUT_CLAUDE_COMMAND: makeFakeClaude(),
    DUGOUT_OPEN_COMMAND: makeFakeOpen(openLog),
  })
  page = await app.firstWindow()
  repo = makeRepo()
  await addProjectFolder(app, page, repo)
})

test.afterEach(async () => {
  await app.close()
})

const explorer = () => page.getByRole('complementary', { name: 'Explorer' })
const workspace = () => page.locator('[data-active="true"]')

test('opens the project and a worktree agent in another app, remembering the choice', async () => {
  // Act: open the project in Finder from the Explorer
  await explorer().getByRole('button', { name: 'Open project in…' }).click()
  await page
    .getByRole('menu', { name: 'Open in' })
    .getByRole('menuitem', { name: 'Finder' })
    .click()

  // Assert: main launched Finder on the project folder, and the menu closed
  await expect.poll(openCalls).toEqual([['-a', 'Finder', repo]])
  await expect(page.getByRole('menu', { name: 'Open in' })).toBeHidden()

  // Act: a worktree agent offers the same menu, with Finder remembered and focused
  await chooseNewAgentAction(workspace(), 'New Claude agent in worktree')
  const pane = workspace().getByRole('region', { name: /terminal$/ })
  await expect(pane).toContainText('⎇ dugout/')
  await pane.getByRole('button', { name: 'Open worktree in…' }).click()
  const finder = page.getByRole('menuitem', { name: /^Finder/ })
  await expect(finder).toContainText('last used')
  await expect(finder).toBeFocused()
  await page.keyboard.press('Enter')

  // Assert: the worktree folder (under app data, not the project) was opened
  await expect.poll(() => openCalls().length).toBe(2)
  const worktreeCall = openCalls()[1] ?? []
  expect(worktreeCall.slice(0, 2)).toEqual(['-a', 'Finder'])
  expect(worktreeCall[2]).toContain('/worktrees/')
  expect(worktreeCall[2]).not.toBe(repo)
})

test('main refuses to open a folder that is not one of the project checkouts', async () => {
  // Act: ask main directly for a folder that is not a Dugout worktree
  const result = await page.evaluate(async (outside) => {
    const { dugout } = globalThis as unknown as { dugout: DugoutApi }
    const projects = await dugout.projects.list()
    const projectId = projects.ok ? (projects.data[0]?.id ?? '') : ''
    return dugout.openIn.open({ projectId, worktreePath: outside }, 'finder')
  }, makeTempDir())

  // Assert
  expect(result).toEqual({ ok: false, error: 'That folder is not a worktree of this project.' })
  expect(openCalls()).toEqual([])
})
