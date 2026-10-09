import { useState } from 'react'
import { X } from 'lucide-react'
import type { WithheldServers } from '@shared/agentConfig'
import type { ProjectId } from '@shared/project'
import { unwrap } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'
import { Icon } from '@renderer/lib/Icon'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { ApprovalServerList } from './ApprovalServerList'
import { withheldText } from './serverSummary'
import styles from './ServerApproval.module.css'

interface WithheldServersNoticeProps {
  readonly projectId: ProjectId
  /** The agent's `label`, e.g. "Codex". */
  readonly agentLabel: string
  readonly withheld: WithheldServers
  onDismiss(): void
}

type NoticeState =
  | { readonly kind: 'waiting' | 'busy' | 'approved' }
  | { readonly kind: 'error'; readonly message: string }

/**
 * Shown in an agent's pane when it started without the project's `.mcp.json` servers because
 * they are not approved (decision 052). Never blocks the agent; an approval applies from its next
 * start, and is refused if the main checkout's file is not the one shown here.
 */
export function WithheldServersNotice(props: WithheldServersNoticeProps) {
  const { projectId, agentLabel, withheld, onDismiss } = props
  const [state, setState] = useState<NoticeState>({ kind: 'waiting' })
  const openAgentSettings = useEditorStore((store) => store.openAgentSettings)

  const approve = async () => {
    setState({ kind: 'busy' })
    try {
      unwrap(await dugout.agentConfig.approveServers(projectId, withheld.hash))
      setState({ kind: 'approved' })
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  const isApproved = state.kind === 'approved'
  return (
    <aside
      className={styles.notice}
      data-approved={isApproved}
      aria-label="Project MCP servers waiting for approval"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <button className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
        <Icon icon={X} />
      </button>
      {isApproved ? (
        <p className={styles.approved}>
          ✓ Approved. Restart this agent, or start a new {agentLabel} agent, to give it these
          servers.
        </p>
      ) : (
        <>
          <p className={styles.text}>{withheldText(withheld.servers.length, agentLabel)}</p>
          <ApprovalServerList servers={withheld.servers} />
          <div className={styles.actions}>
            <button
              className={styles.primary}
              onClick={() => void approve()}
              disabled={state.kind === 'busy'}
            >
              Approve for {agentLabel}
            </button>
            <button onClick={() => openAgentSettings(projectId)}>Agent settings</button>
          </div>
          {state.kind === 'error' && (
            <p className={styles.error} role="alert">
              {state.message}
            </p>
          )}
        </>
      )}
    </aside>
  )
}
