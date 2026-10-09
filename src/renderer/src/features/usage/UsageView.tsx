import { AGENT_LABEL, AGENT_LIST } from '@shared/agents'
import type { ProjectId } from '@shared/project'
import { taskKey, taskSourceOf, type TaskSource } from '@shared/tasks'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { headlineTokens, type ProjectUsage, type UsageTotals } from '@shared/usage'
import { formatCost, formatTokens, hasUsage } from './usageFormat'
import { useProjectUsage, useUsageStore } from './usageStore'
import styles from './UsageView.module.css'

function Stat({ label, totals }: { label: string; totals: UsageTotals }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue}>{formatTokens(headlineTokens(totals))}</span>
      <span className={styles.statNote}>
        tokens · ≈ {formatCost(totals.costUsd)} · {formatTokens(totals.cacheRead)} cache reads
      </span>
    </div>
  )
}

/** Token columns shared by every table: tokens, cache reads, cost. */
function Cells({ totals }: { totals: UsageTotals }) {
  return (
    <>
      <td>{formatTokens(headlineTokens(totals))}</td>
      <td>{formatTokens(totals.cacheRead)}</td>
      <td>{formatCost(totals.costUsd)}</td>
    </>
  )
}

function TotalsTable(props: {
  caption: string
  firstColumn: string
  rows: readonly { key: string; label: string; totals: UsageTotals }[]
}) {
  return (
    <table className={styles.table}>
      <caption>{props.caption}</caption>
      <thead>
        <tr>
          <th scope="col">{props.firstColumn}</th>
          <th scope="col">Tokens</th>
          <th scope="col">Cache reads</th>
          <th scope="col">Cost (est.)</th>
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr key={row.key}>
            <th scope="row">{row.label}</th>
            <Cells totals={row.totals} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DaysTable({ usage }: { usage: ProjectUsage }) {
  const agents = AGENT_LIST.filter((agent) => hasUsage(usage.byAgent[agent.kind]))
  return (
    <table className={styles.table}>
      <caption>Last 30 days</caption>
      <thead>
        <tr>
          <th scope="col">Day</th>
          {agents.map((agent) => (
            <th key={agent.kind} scope="col">
              {agent.label}
            </th>
          ))}
          <th scope="col">Tokens</th>
          <th scope="col">Cache reads</th>
          <th scope="col">Cost (est.)</th>
        </tr>
      </thead>
      <tbody>
        {usage.days.map((day) => (
          <tr key={day.day}>
            <th scope="row">{day.day}</th>
            {agents.map((agent) => {
              const totals = day.byAgent[agent.kind]
              return <td key={agent.kind}>{totals ? formatTokens(headlineTokens(totals)) : '–'}</td>
            })}
            <Cells totals={day.totals} />
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function UsageReport({ usage, source }: { usage: ProjectUsage; source: TaskSource }) {
  const byAgent = AGENT_LIST.flatMap((agent) => {
    const totals = usage.byAgent[agent.kind]
    return totals ? [{ key: agent.kind, label: AGENT_LABEL[agent.kind], totals }] : []
  })
  const byModel = usage.byModel.map(({ model, totals }) => ({ key: model, label: model, totals }))
  const byTask = usage.byTask.map(({ task, totals }) => ({
    key: String(task),
    label: taskKey(source, task),
    totals,
  }))
  return (
    <>
      <div className={styles.stats}>
        <Stat label="Lifetime" totals={usage.lifetime} />
        <Stat label="Last 30 days" totals={usage.last30Days} />
      </div>
      {usage.days.length > 0 && <DaysTable usage={usage} />}
      <TotalsTable caption="By agent" firstColumn="Agent" rows={byAgent} />
      <TotalsTable caption="By model" firstColumn="Model" rows={byModel} />
      {byTask.length > 0 && <TotalsTable caption="By task" firstColumn="Task" rows={byTask} />}
    </>
  )
}

/** A project's token usage, per day, agent, model and task (opened as an editor tab). */
export function UsageView({ projectId }: { projectId: ProjectId }) {
  const usage = useProjectUsage(projectId)
  const error = useUsageStore((state) => state.errors[projectId] ?? null)
  // Tasks are labelled the way their source writes them: "#12", or "ENG-12" for Linear.
  const source = useProjectsStore((state) =>
    taskSourceOf(state.projects.find((project) => project.id === projectId) ?? {}),
  )
  return (
    <section className={styles.view} aria-label="Token usage">
      <div className={styles.page}>
        <h1 className={styles.title}>Token usage</h1>
        <p className={styles.muted}>
          Tokens are input, output and cache writes; cache reads are cheap and counted apart. Cost
          is the <strong>API-equivalent cost (estimate)</strong> at list prices
          {usage ? ` as of ${usage.pricesAsOf}` : ''}: subscriptions do not pay per token. Only
          agents started in Dugout are counted, from when they ran.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            Could not load usage: {error}
          </p>
        )}
        {usage && !hasUsage(usage.lifetime) && (
          <p className={styles.muted}>No usage yet. Start an agent and it shows up here.</p>
        )}
        {usage && hasUsage(usage.lifetime) && <UsageReport usage={usage} source={source} />}
      </div>
    </section>
  )
}
