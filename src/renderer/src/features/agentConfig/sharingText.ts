import type { CodexSharing } from '@shared/agentConfig'

/** Which agents get an MCP server, and why Codex does not when it cannot. */
export function sharingText(sharing: CodexSharing | undefined): string {
  return sharing?.isShared === false ? `Claude only: ${sharing.reason}` : 'Claude and Codex'
}
