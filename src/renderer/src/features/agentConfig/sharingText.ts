import type { CodexSharing } from '@shared/agentConfig'

/**
 * Which agents get an MCP server, and why Codex does not when it cannot. `isApproved`: whether
 * the project's servers are approved for Codex (decision 057); presets are judged as if they were.
 */
export function sharingText(sharing: CodexSharing | undefined, isApproved = true): string {
  if (sharing?.isShared === false) return `Claude only: ${sharing.reason}`
  return isApproved ? 'Claude and Codex' : 'Claude, and Codex once approved'
}
