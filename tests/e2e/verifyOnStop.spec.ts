import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  addProjectFolder,
  chooseNewAgentAction,
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
} from './helpers'

let app: ElectronApplication
let page: Page
let repo: string
/** The fake check fails while this file exists. */
let failMarker: string
let checkCommand: string

test.beforeEach(async () => {
  // A fake check command: prints where it runs, then passes or fails on cue.
  const checkDir = makeTempDir('dugout-check-')
  const script = join(checkDir, 'check.sh')
  failMarker = join(checkDir, 'fail')
  writeFileSync(
    script,
    [
      'echo "checking in $(pwd)"',
      `if [ -f '${failMarker}' ]; then echo "expected 1 to be 2" >&2; exit 1; fi`,
      'echo "all good"',
    ].join('\n'),
  )
  checkCommand = `sh '${script}'`
  repo = makeGitRepo('app')
  const userData = makeTempDir()
  app = await launchApp(userData, { DUGOUT_CLAUDE_COMMAND: makeFakeClaude() })
  page = await app.firstWindow()
  await addProjectFolder(app, page, repo)

  // Verify on Stop is off until the project has a check command.
  await chooseNewAgentAction(page, 'Agent settings')
  const form = page.getByRole('form', { name: 'Verify on Stop' })
  await form.getByRole('textbox', { name: /Check command/ }).fill(checkCommand)
  await form.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('region', { name: 'Agent settings' })).toContainText('On. When')
  const saved = JSON.parse(readFileSync(join(userData, 'projects.json'), 'utf8'))
  expect(saved.projects[0].checkCommand).toBe(checkCommand)
})

test.afterEach(async () => {
  await app.close()
  rmSync(failMarker, { force: true })
})

const agentHeader = (index = 0) =>
  page.getByRole('region', { name: 'Claude Code terminal' }).nth(index).locator('header')

async function send(line: string): Promise<void> {
  await page.locator('[data-active="true"] [data-testid="terminal"]').last().click()
  await page.keyboard.type(`${line}\n`)
}

test('runs the check when an agent stops, and sends a failure back to it', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(agentHeader()).toContainText('Ready')

  // Act + Assert: a passing check
  await send('prompt')
  await send('stop')
  await expect(agentHeader()).toContainText('Check passed', { timeout: 20_000 })

  // A new turn clears the result; the next stop runs the check again, which now fails
  writeFileSync(failMarker, '')
  await send('prompt')
  await expect(agentHeader()).not.toContainText('Check passed')
  await send('stop')
  const failed = agentHeader().getByRole('button', { name: 'Check failed' })
  await expect(failed).toBeVisible({ timeout: 20_000 })

  // The failure shows the output of the check, run in the agent's checkout
  await failed.click()
  const popover = page.getByRole('dialog', { name: 'Check failed' })
  await expect(popover).toContainText('exited with code 1')
  await expect(popover).toContainText(`checking in ${repo}`)
  await expect(popover).toContainText('expected 1 to be 2')

  // Send failure to agent types it into the agent's terminal
  await popover.getByRole('button', { name: 'Send failure to agent' }).click()
  await expect(popover).toBeHidden()
  await expect.poll(output).toContain(`The project check \`${checkCommand}\` failed (exit code 1)`)
  await expect.poll(output).toContain('expected 1 to be 2')
})

test('the inbox shows the check of an agent that finished out of view', async () => {
  // Arrange: an agent stops after another agent took focus
  writeFileSync(failMarker, '')
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(agentHeader()).toContainText('Ready')
  await send('prompt')
  await send('stop-later')
  await clickMenuItem(app, 'File', 'New Claude Agent')
  await expect(agentHeader(1)).toContainText('Ready')

  // Act
  await expect(agentHeader(0)).toContainText('Check failed', { timeout: 20_000 })
  await page.getByRole('button', { name: /^Inbox/ }).click()

  // Assert
  const inbox = page.getByRole('dialog', { name: 'Inbox' })
  await expect(inbox.getByRole('button', { name: /Check failed$/ })).toBeVisible()
  await expect(inbox).toContainText('Check failed')
})
