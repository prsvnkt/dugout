import { join } from 'node:path'
import { IpcChannel } from '@shared/ipc/channels'
import { gitHubConfig, GITHUB_SCOPES, type GitHubConfig } from '../services/github/config'
import { DeviceFlowClient } from '../services/github/DeviceFlowClient'
import { GitHubApi } from '../services/github/GitHubApi'
import { GitHubAuth } from '../services/github/GitHubAuth'
import { TokenStore } from '../services/github/TokenStore'
import { broadcast, schedule, type AppEnv } from './appEnv'

const GITHUB_TOKEN_FILE = 'github-token.bin'

export interface GithubServices {
  readonly config: GitHubConfig
  readonly api: GitHubApi
  readonly auth: GitHubAuth
}

/** GitHub sign-in (device flow, token in safeStorage) and its API client. */
export function composeGithub(env: AppEnv): GithubServices {
  const config = gitHubConfig(env.overrides)
  const api = new GitHubApi({ fetch, apiBaseUrl: config.apiBaseUrl })
  const auth = new GitHubAuth({
    isConfigured: config.clientId !== '',
    now: () => Date.now(),
    deviceFlow: new DeviceFlowClient({
      fetch,
      webBaseUrl: config.webBaseUrl,
      clientId: config.clientId,
      scopes: GITHUB_SCOPES,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      now: () => Date.now(),
    }),
    tokens: new TokenStore({
      filePath: join(env.dataDir, GITHUB_TOKEN_FILE),
      encryption: env.encryption,
    }),
    api,
    onChange: (state) => broadcast(IpcChannel.authState, state),
    schedule,
  })
  void auth.init().catch((error: unknown) => console.error('[github] init failed:', error))
  return { config, api, auth }
}
