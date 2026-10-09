import type { McpServer } from '@shared/agentConfig'
import { serverCommand, serverInputs } from './serverSummary'
import styles from './ServerApproval.module.css'

interface ApprovalServerListProps {
  readonly servers: readonly McpServer[]
}

/** The servers waiting for approval: name, what it runs, and the names of its inputs. */
export function ApprovalServerList({ servers }: ApprovalServerListProps) {
  return (
    <ul className={styles.list}>
      {servers.map((server) => (
        <li
          key={server.name}
          className={styles.item}
          aria-label={`Server to approve ${server.name}`}
        >
          <span className={styles.name}>{server.name}</span>
          <code className={styles.command}>{serverCommand(server)}</code>
          {serverInputs(server) && <span className={styles.inputs}>{serverInputs(server)}</span>}
        </li>
      ))}
    </ul>
  )
}
