import { AGENT_LIST, type AgentInfo } from '@shared/agents'
import type { AgentCliStatus } from '@shared/welcome'
import start from '@renderer/features/start/StartScreen.module.css'
import { useAgentCheck } from './useWelcomeData'
import styles from './Welcome.module.css'

/** Status in words as well as colour. */
const STATE_LABEL: Readonly<Record<AgentCliStatus['state'], string>> = {
  installed: 'Installed',
  missing: 'Not found',
  unknown: 'Unknown',
}

function Detail({ agent, status }: { agent: AgentInfo; status: AgentCliStatus | null }) {
  if (status === null) return <>Checking…</>
  switch (status.state) {
    case 'installed':
      return <>{status.path}</>
    case 'missing':
      return (
        <>
          Install with <code className={styles.code}>{agent.installCommand}</code>
        </>
      )
    case 'unknown':
      return <>Could not check your shell&apos;s PATH.</>
  }
}

/** Whether each agent CLI is installed, so a missing one is found before the first agent fails. */
export function AgentCheckList() {
  const { check, recheck } = useAgentCheck()
  const needsAttention =
    check !== null && AGENT_LIST.some((a) => check[a.kind].state !== 'installed')

  return (
    <section className={start.section} aria-label="Agents">
      <h2 className={start.sectionHeading}>Agents</h2>
      <ul className={start.list}>
        {AGENT_LIST.map((agent) => {
          const status = check?.[agent.kind] ?? null
          return (
            <li key={agent.kind} className={styles.agentRow}>
              <span className={start.rowText}>
                <span className={start.rowTitle}>{agent.cliName}</span>
                <span className={start.rowMeta}>
                  <Detail agent={agent} status={status} />
                </span>
              </span>
              <span className={`${styles.agentState} ${styles[status?.state ?? 'checking']}`}>
                {status ? STATE_LABEL[status.state] : 'Checking…'}
              </span>
            </li>
          )
        })}
      </ul>
      {needsAttention && (
        <div className={styles.footer}>
          <span>You need at least one agent installed.</span>
          <button className={styles.linkButton} onClick={recheck}>
            Check again
          </button>
        </div>
      )}
    </section>
  )
}
