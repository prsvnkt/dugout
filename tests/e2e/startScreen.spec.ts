import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import {
  clickMenuItem,
  launchApp,
  makeFakeClaude,
  makeFakeCodex,
  makeGitRepo,
  makeTempDir,
  recordTerminalOutput,
  stubFolderPicker,
} from './helpers'

let app: ElectronApplication
let page: Page
let userDataDir: string
let agentEnv: Record<string, string>

async function start(): Promise<void> {
  app = await launchApp(userDataDir, agentEnv)
  page = await app.firstWindow()
}

test.beforeEach(async () => {
  userDataDir = makeTempDir()
  agentEnv = { DUGOUT_CLAUDE_COMMAND: makeFakeClaude(), DUGOUT_CODEX_COMMAND: makeFakeCodex() }
  await start()
})

test.afterEach(async () => {
  await app.close()
})

const workspace = () => page.locator('[data-active="true"]')
const promptBox = () => workspace().getByLabel('What do you want to work on in alpha?')
const agentPicker = () => workspace().getByRole('combobox', { name: 'Agent' })

async function addProject(name: string): Promise<void> {
  await stubFolderPicker(app, makeGitRepo(name))
  await page.getByRole('button', { name: 'Add project…' }).click()
}

test('the prompt box starts the default agent with the prompt', async () => {
  // Arrange
  const output = await recordTerminalOutput(page)
  await addProject('alpha')

  // Act
  await promptBox().fill('Fix the login bug\nIt fails on Safari')
  await promptBox().press('Enter')

  // Assert
  await expect.poll(output).toContain('fake-claude ready')
  await expect.poll(output).toContain('prompt=Fix the login bug')
  await expect(workspace().getByRole('region', { name: /terminal$/ })).toHaveCount(1)
})

test('the default agent can be changed and is remembered', async () => {
  // Arrange
  await addProject('alpha')
  await expect(agentPicker()).toHaveValue('claude')

  // Act
  await agentPicker().selectOption('codex')
  await expect(agentPicker()).toHaveValue('codex')
  await app.close()
  await start()
  const output = await recordTerminalOutput(page)
  await promptBox().fill('Add dark mode')
  await workspace().getByRole('button', { name: 'Start' }).click()

  // Assert
  await expect.poll(output).toContain('fake-codex ready')
  await expect.poll(output).toContain('prompt=Add dark mode')
})

test('a closed agent can be resumed from the start screen', async () => {
  // Arrange: an agent with a conversation
  const output = await recordTerminalOutput(page)
  await addProject('alpha')
  await promptBox().fill('Fix the login bug')
  await promptBox().press('Enter')
  await expect.poll(output).toContain('fake-claude ready')
  const sessionId = /session=(fake-session-\d+)/.exec(await output())?.[1] ?? ''
  expect(sessionId).not.toBe('')
  await workspace().getByTestId('terminal').click()
  await page.keyboard.type('prompt\n')
  await expect(workspace().getByRole('region', { name: /terminal$/ })).toContainText('Working')

  // Act
  await clickMenuItem(app, 'File', 'Close Tab, Agent or Shell')
  const recent = workspace().getByRole('region', { name: 'Pick up where you left off' })
  await recent.getByRole('button', { name: /Fix the login bug/ }).click()

  // Assert
  await expect.poll(output).toContain(`resume=${sessionId}`)
  await expect(recent).toBeHidden()
})
