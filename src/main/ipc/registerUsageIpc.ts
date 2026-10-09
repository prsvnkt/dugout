import { IpcChannel } from '@shared/ipc/channels'
import { usageProjectRequestSchema } from '@shared/ipc/contract'
import type { UsageService } from '../services/usage/UsageService'
import { handleRequest } from './handle'

/** `usage` is null when the ledger could not be set up; requests then fail readably. */
export function registerUsageIpc(usage: Pick<UsageService, 'projectUsage'> | null): void {
  handleRequest(IpcChannel.usageProject, usageProjectRequestSchema, ({ projectId }) => {
    if (!usage) throw new Error('Token usage is unavailable.')
    return usage.projectUsage(projectId)
  })
}
