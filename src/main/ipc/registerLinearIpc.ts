import { z } from 'zod'
import { IpcChannel } from '@shared/ipc/channels'
import { linearConnectRequestSchema } from '@shared/ipc/contract'
import type { LinearAuth } from '../services/linear/LinearAuth'
import type { LinearIssues } from '../services/linear/LinearIssues'
import { handleRequest } from './handle'

export interface LinearIpcDeps {
  readonly auth: LinearAuth
  readonly issues: LinearIssues
}

/** Linear connection for task sources. Only the account name and teams reach the renderer. */
export function registerLinearIpc({ auth, issues }: LinearIpcDeps): void {
  handleRequest(IpcChannel.linearGetState, z.undefined(), () => auth.state())
  handleRequest(IpcChannel.linearConnect, linearConnectRequestSchema, ({ apiKey }) =>
    auth.connect(apiKey),
  )
  handleRequest(IpcChannel.linearDisconnect, z.undefined(), () => auth.disconnect())
  handleRequest(IpcChannel.linearListTeams, z.undefined(), () =>
    auth.withKey((apiKey) => issues.teams(apiKey)),
  )
}
