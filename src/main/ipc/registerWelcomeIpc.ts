import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import type { AgentKind } from '@shared/terminal'
import { REPO_SEARCH_SCOPES } from '@shared/welcome'
import type { SettingsStore } from '../services/settings/SettingsStore'
import { checkAgentClis, type ShellRunner } from '../services/welcome/checkAgentClis'
import { findLocalRepos, searchRoots } from '../services/welcome/findLocalRepos'
import { handleRequest } from './handle'

export interface WelcomeIpcDeps {
  readonly settings: SettingsStore
  readonly homeDir: string
  readonly runInLoginShell: ShellRunner
  /** The commands agent terminals run, so the check matches what will actually launch. */
  readonly agentCommands: Readonly<Record<AgentKind, string>>
}

/** Read-only lookups for the first-run screen. Nothing here writes or spawns an agent. */
export function registerWelcomeIpc(deps: WelcomeIpcDeps): void {
  handleRequest(IpcChannel.welcomeFindRepos, z.enum(REPO_SEARCH_SCOPES), async (scope) => {
    const { cloneParentDir } = await deps.settings.load()
    return findLocalRepos(searchRoots(scope, { homeDir: deps.homeDir, cloneParentDir }))
  })
  handleRequest(IpcChannel.welcomeCheckAgents, z.undefined(), () =>
    checkAgentClis(deps.runInLoginShell, deps.agentCommands),
  )
}
