import { AGENTS } from '@shared/agents'
import { SHARED_CONTEXT_DIR } from '@shared/context'
import type { ProjectId } from '@shared/project'
import { useDefaultAgent } from '@renderer/features/start/defaultAgentStore'
import { AddEntryForm } from './AddEntryForm'
import { useProjectContext } from './contextStore'
import { EntryCard } from './EntryCard'
import { ProposalCard } from './ProposalCard'
import { useContextActions } from './useContextActions'
import styles from './Context.module.css'

/** "Build codemap" asks the default agent, when it has a headless mode (e.g. `claude -p`). */
function CodemapButton({ projectId }: { projectId: ProjectId }) {
  const agent = AGENTS[useDefaultAgent()]
  const actions = useContextActions(projectId)
  if (!agent.capabilities.canRunHeadless) return null
  return (
    <div>
      <button
        onClick={() => void actions.buildCodemap(agent.kind)}
        disabled={actions.isBuilding}
        title={`${agent.label} surveys the codebase and writes a shared Codemap entry`}
      >
        {actions.isBuilding ? `Building codemap with ${agent.label}…` : 'Build codemap'}
      </button>
      {actions.error && (
        <p className={styles.error} role="alert">
          {actions.error}
        </p>
      )}
    </div>
  )
}

/**
 * A project's context for agents: what they can read with Dugout's context tools, notes they
 * proposed (shared only once approved), and forms to add more.
 */
export function ContextView({ projectId }: { projectId: ProjectId }) {
  const { context, error: loadError } = useProjectContext(projectId)
  const actions = useContextActions(projectId)
  const error = actions.error ?? loadError
  const entryActions = {
    isBusy: actions.isBusy,
    edit: actions.edit,
    remove: actions.remove,
    repin: actions.repin,
  }

  return (
    <section className={styles.view} aria-label="Project context">
      <section className={styles.section}>
        <div className={styles.headerRow}>
          <h2>Project context</h2>
          <CodemapButton projectId={projectId} />
        </div>
        <p className={styles.muted}>
          What agents in this project read through Dugout&apos;s tools (list_context, get_context,
          search_context). Shared entries are files in {SHARED_CONTEXT_DIR}/ for the team to commit;
          private ones stay on this Mac. Pinned files are flagged when they change.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </section>
      {context && context.proposals.length > 0 && (
        <section className={styles.section} aria-labelledby="context-proposed">
          <h3 id="context-proposed">Proposed by agents</h3>
          <ul className={styles.list}>
            {context.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                isBusy={actions.isBusy}
                onApprove={() => actions.approve(proposal.id)}
                onDiscard={() => actions.discard(proposal.id)}
              />
            ))}
          </ul>
        </section>
      )}
      <section className={styles.section} aria-labelledby="context-entries">
        <h3 id="context-entries">Entries</h3>
        {!context && !error && <p className={styles.muted}>Loading…</p>}
        {context?.entries.length === 0 && (
          <p className={styles.muted}>No context yet. Add a note, a file or a link below.</p>
        )}
        <ul className={styles.list} aria-label="Context entries">
          {context?.entries.map((entry) => (
            <EntryCard key={`${entry.scope}:${entry.id}`} entry={entry} actions={entryActions} />
          ))}
        </ul>
      </section>
      <section className={styles.section} aria-labelledby="context-add">
        <h3 id="context-add">Add context</h3>
        <AddEntryForm isBusy={actions.isBusy} onAdd={actions.add} onImport={actions.importDoc} />
      </section>
    </section>
  )
}
