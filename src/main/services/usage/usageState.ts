import type { AgentKind } from '@shared/agents'
import {
  addTotals,
  EMPTY_TOTALS,
  type ContextUsage,
  type TokenCounts,
  type UsageTotals,
} from '@shared/usage'
import type { TokenDetail, TranscriptCarry, UsageObservation } from '../transcripts/types'
import { costOf } from './prices'

/** Who an agent's usage belongs to: the terminal's project, its task and its session. */
export interface Attribution {
  readonly projectId: string
  readonly agent: AgentKind
  readonly task: number | null
  readonly sessionId: string
  /** The checkout (main or a worktree) the agent ran in. */
  readonly cwd: string
}

/** One line of the append-only ledger: usage counted once, with what it is attributed to. */
export interface LedgerEntry extends Omit<Attribution, 'sessionId'> {
  readonly sessionId: string
  readonly at: string
  /** Local date, `YYYY-MM-DD`. */
  readonly day: string
  readonly model: string | null
  /** The reply's message id, or the session a running total belongs to. */
  readonly key: string
  readonly kind: UsageObservation['kind']
  readonly tokens: TokenCounts
  /** API-equivalent cost when recorded; null when the model had no price. */
  readonly costUsd: number | null
  /** Running totals only: the session's total after this entry. */
  readonly total?: TokenDetail
}

/** Usage summed by day, project, agent, model and task: what every view is built from. */
export interface UsageRow {
  readonly day: string
  readonly projectId: string
  readonly agent: AgentKind
  readonly model: string | null
  readonly task: number | null
  readonly totals: UsageTotals
}

export interface SessionRecord {
  readonly totals: UsageTotals
  readonly model: string | null
  readonly context: ContextUsage | null
  /** Last day it had usage or was read, for pruning. */
  readonly day: string
}

/** Where reading a transcript left off. */
export interface Cursor {
  readonly offset: number
  readonly carry: TranscriptCarry
  readonly day: string
}

export interface UsageState {
  readonly version: 1
  /** Ledger bytes already in this state; later lines are replayed on load. */
  readonly ledgerBytes: number
  readonly rows: Readonly<Record<string, UsageRow>>
  /** Message ids already counted, with the day they were, so forks and streams count once. */
  readonly seen: Readonly<Record<string, string>>
  /** The last running total counted per session (Codex). */
  readonly cumulative: Readonly<Record<string, TokenDetail>>
  readonly sessions: Readonly<Record<string, SessionRecord>>
  readonly cursors: Readonly<Record<string, Cursor>>
}

export const EMPTY_STATE: UsageState = {
  version: 1,
  ledgerBytes: 0,
  rows: {},
  seen: {},
  cumulative: {},
  sessions: {},
  cursors: {},
}

/** Local calendar date of `date`, `YYYY-MM-DD`. */
export function localDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function dayOf(at: string, now: Date): string {
  const time = Date.parse(at)
  return localDay(Number.isNaN(time) ? now : new Date(time))
}

function difference(next: TokenDetail, previous: TokenDetail | undefined): TokenDetail {
  if (!previous) return next
  const fields = ['input', 'output', 'cacheRead', 'cacheWrite'] as const
  // A total that went down started again (a new run of the session): count it from zero.
  if (fields.some((field) => next[field] < previous[field])) return next
  return {
    input: next.input - previous.input,
    output: next.output - previous.output,
    cacheRead: next.cacheRead - previous.cacheRead,
    cacheWrite: next.cacheWrite - previous.cacheWrite,
    cacheWriteLong: Math.max(0, next.cacheWriteLong - previous.cacheWriteLong),
  }
}

function hasTokens(tokens: TokenCounts): boolean {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite > 0
}

/**
 * Ledger entries for observations from one transcript read: replies already counted (in any
 * file) are skipped, and running totals become the growth since the last one counted.
 */
export function entriesFor(
  state: UsageState,
  observations: readonly UsageObservation[],
  attribution: Attribution,
  now: Date,
): LedgerEntry[] {
  const seen = new Set<string>()
  const totals = new Map<string, TokenDetail>()
  const entries: LedgerEntry[] = []
  for (const observation of observations) {
    let tokens: TokenDetail
    let key: string
    if (observation.kind === 'message') {
      key = observation.id
      if (state.seen[key] !== undefined || seen.has(key)) continue
      seen.add(key)
      tokens = observation.tokens
    } else {
      key = observation.key
      tokens = difference(observation.tokens, totals.get(key) ?? state.cumulative[key])
      totals.set(key, observation.tokens)
      if (!hasTokens(tokens)) continue
    }
    const { cacheWriteLong: _long, ...counts } = tokens
    entries.push({
      ...attribution,
      at: observation.at,
      day: dayOf(observation.at, now),
      model: observation.model,
      key,
      kind: observation.kind,
      tokens: counts,
      costUsd: costOf(observation.model, tokens),
      ...(observation.kind === 'cumulative' && { total: observation.tokens }),
    })
  }
  return entries
}

export function totalsOf(entry: LedgerEntry): UsageTotals {
  const { input, output, cacheRead, cacheWrite } = entry.tokens
  const isPriced = entry.costUsd !== null
  return {
    input,
    output,
    cacheRead,
    cacheWrite,
    costUsd: entry.costUsd ?? 0,
    unpricedTokens: isPriced ? 0 : input + output + cacheRead + cacheWrite,
  }
}

export function rowKey(entry: Omit<UsageRow, 'totals'>): string {
  return [entry.day, entry.projectId, entry.agent, entry.model ?? '', entry.task ?? ''].join('|')
}

/** Adds entries (new, or replayed from the ledger) to the rollups, sessions and dedupe sets. */
export function applyEntries(state: UsageState, entries: readonly LedgerEntry[]): UsageState {
  if (entries.length === 0) return state
  const rows = { ...state.rows }
  const seen = { ...state.seen }
  const cumulative = { ...state.cumulative }
  const sessions = { ...state.sessions }
  for (const entry of entries) {
    const totals = totalsOf(entry)
    const { day, projectId, agent, model, task } = entry
    const key = rowKey({ day, projectId, agent, model, task })
    rows[key] = {
      day,
      projectId,
      agent,
      model,
      task,
      totals: addTotals(rows[key]?.totals ?? EMPTY_TOTALS, totals),
    }
    if (entry.kind === 'message') seen[entry.key] = day
    if (entry.total) cumulative[entry.key] = entry.total
    const session = sessions[entry.sessionId]
    sessions[entry.sessionId] = {
      totals: addTotals(session?.totals ?? EMPTY_TOTALS, totals),
      model: model ?? session?.model ?? null,
      context: session?.context ?? null,
      day,
    }
  }
  return { ...state, rows, seen, cumulative, sessions }
}

/** Records how full a session's context window is after its latest call. */
export function withContext(
  state: UsageState,
  sessionId: string,
  model: string | null,
  context: ContextUsage | null,
  day: string,
): UsageState {
  const session = state.sessions[sessionId]
  const next: SessionRecord = {
    totals: session?.totals ?? EMPTY_TOTALS,
    model: model ?? session?.model ?? null,
    context: context ?? session?.context ?? null,
    day,
  }
  return { ...state, sessions: { ...state.sessions, [sessionId]: next } }
}

export function withCursor(state: UsageState, path: string, cursor: Cursor): UsageState {
  return { ...state, cursors: { ...state.cursors, [path]: cursor } }
}

function keepRecent<T>(
  record: Readonly<Record<string, T>>,
  dayOfValue: (value: T) => string,
  oldest: string,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => dayOfValue(value) >= oldest),
  )
}

/**
 * Forgets dedupe ids, sessions and read positions not touched since `oldest`, so the state stays
 * small; the rollups (the totals themselves) are kept forever.
 */
export function prune(state: UsageState, oldest: string): UsageState {
  return {
    ...state,
    seen: keepRecent(state.seen, (day) => day, oldest),
    sessions: keepRecent(state.sessions, (session) => session.day, oldest),
    cursors: keepRecent(state.cursors, (cursor) => cursor.day, oldest),
  }
}
