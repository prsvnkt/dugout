import type { McpServer, ServerApproval } from '@shared/agentConfig'
import { ApprovalServerList } from './ApprovalServerList'
import { APPROVAL_AGENTS } from './serverSummary'
import styles from './ServerApproval.module.css'

interface ServerApprovalSectionProps {
  /** The `.mcp.json` servers agents that need approval would get. */
  readonly servers: readonly McpServer[]
  readonly approval: ServerApproval
  readonly isBusy: boolean
  onApprove(): void
  onRevoke(): void
}

/**
 * Approval of the project's `.mcp.json` servers for agents whose CLI does not ask before running
 * them (decision 057). Stored in Dugout, never in the repo; any change to the file needs it again.
 */
export function ServerApprovalSection(props: ServerApprovalSectionProps) {
  const { servers, approval, isBusy } = props
  if (servers.length === 0 || APPROVAL_AGENTS === '') return null
  return (
    <section
      className={styles.box}
      data-approved={approval.isApproved}
      aria-label={`Approval for ${APPROVAL_AGENTS}`}
    >
      <h3 className={styles.title}>Approval for {APPROVAL_AGENTS}</h3>
      <p className={styles.text}>
        {APPROVAL_AGENTS} does not ask before it starts a project&apos;s MCP servers, so Dugout
        passes these to {APPROVAL_AGENTS} agents only once you approve them. They run as you, with
        your environment. The approval is kept in Dugout, not in the repo, and lapses whenever the
        servers in .mcp.json change.
      </p>
      <ApprovalServerList servers={servers} />
      {approval.isApproved ? (
        <div className={styles.actions}>
          <p className={styles.approved}>
            ✓ Approved for {APPROVAL_AGENTS}. New {APPROVAL_AGENTS} agents get these servers.
          </p>
          <button onClick={props.onRevoke} disabled={isBusy}>
            Revoke approval
          </button>
        </div>
      ) : (
        <div className={styles.actions}>
          <button className={styles.primary} onClick={props.onApprove} disabled={isBusy}>
            Approve for {APPROVAL_AGENTS}
          </button>
        </div>
      )}
    </section>
  )
}
