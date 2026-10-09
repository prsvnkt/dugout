import type { AgentKind } from '@shared/agents'
import {
  addTotals,
  EMPTY_TOTALS,
  type ProjectUsage,
  type UsageDay,
  type UsageTotals,
} from '@shared/usage'
import { PRICES_AS_OF } from './prices'
import { localDay, type UsageRow, type UsageState } from './usageState'

/** "Last 30 days" includes today. */
export const RECENT_DAYS = 30

/** The local date `days` before `today` (`YYYY-MM-DD`). */
export function daysBefore(today: string, days: number): string {
  const [year, month, day] = today.split('-').map(Number)
  return localDay(new Date(year ?? 1970, (month ?? 1) - 1, (day ?? 1) - days))
}

function sumBy<K extends string | number>(
  rows: readonly UsageRow[],
  keyOf: (row: UsageRow) => K | null,
): Map<K, UsageTotals> {
  const sums = new Map<K, UsageTotals>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key === null) continue
    sums.set(key, addTotals(sums.get(key) ?? EMPTY_TOTALS, row.totals))
  }
  return sums
}

function total(rows: readonly UsageRow[]): UsageTotals {
  return rows.reduce((sum, row) => addTotals(sum, row.totals), EMPTY_TOTALS)
}

function byAgent(rows: readonly UsageRow[]): Partial<Record<AgentKind, UsageTotals>> {
  return Object.fromEntries(sumBy(rows, (row) => row.agent))
}

function days(rows: readonly UsageRow[]): UsageDay[] {
  const byDay = new Map<string, UsageRow[]>()
  for (const row of rows) byDay.set(row.day, [...(byDay.get(row.day) ?? []), row])
  return [...byDay]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([day, dayRows]) => ({ day, totals: total(dayRows), byAgent: byAgent(dayRows) }))
}

/** A project's usage from the rollups: lifetime, last 30 days, and per agent, model, task and day. */
export function projectUsage(state: UsageState, projectId: string, today: string): ProjectUsage {
  const rows = Object.values(state.rows).filter((row) => row.projectId === projectId)
  const since = daysBefore(today, RECENT_DAYS - 1)
  const recent = rows.filter((row) => row.day >= since)
  const models = sumBy(rows, (row) => row.model ?? 'unknown')
  const tasks = [...new Set(rows.flatMap((row) => (row.task === null ? [] : [row.task])))]
  return {
    lifetime: total(rows),
    last30Days: total(recent),
    byAgent: byAgent(rows),
    byModel: [...models]
      .map(([model, totals]) => ({ model, totals }))
      .sort((a, b) => b.totals.costUsd - a.totals.costUsd || a.model.localeCompare(b.model)),
    byTask: tasks
      .sort((a, b) => b - a)
      .map((task) => {
        const taskRows = rows.filter((row) => row.task === task)
        return { task, totals: total(taskRows), byAgent: byAgent(taskRows) }
      }),
    days: days(recent),
    pricesAsOf: PRICES_AS_OF,
  }
}
