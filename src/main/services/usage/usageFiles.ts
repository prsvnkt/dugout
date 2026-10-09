import { appendFile, open, readFile, stat } from 'node:fs/promises'
import { z } from 'zod'
import { AGENT_KINDS } from '@shared/agents'
import { writeFileAtomic } from '../projects/atomicWrite'
import { applyEntries, EMPTY_STATE, type LedgerEntry, type UsageState } from './usageState'

const tokens = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
})
const detail = tokens.extend({ cacheWriteLong: z.number().nonnegative() })
const totals = tokens.extend({
  costUsd: z.number().nonnegative(),
  unpricedTokens: z.number().nonnegative(),
})
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const agent = z.enum(AGENT_KINDS)
const task = z.number().int().positive().nullable()

const ledgerEntrySchema = z.object({
  projectId: z.string().min(1),
  agent,
  task,
  sessionId: z.string().min(1),
  cwd: z.string(),
  at: z.string(),
  day,
  model: z.string().nullable(),
  key: z.string().min(1),
  kind: z.enum(['message', 'cumulative']),
  tokens,
  costUsd: z.number().nonnegative().nullable(),
  total: detail.optional(),
})

const stateSchema = z.object({
  version: z.literal(1),
  ledgerBytes: z.number().int().nonnegative(),
  rows: z.record(
    z.string(),
    z.object({ day, projectId: z.string(), agent, model: z.string().nullable(), task, totals }),
  ),
  seen: z.record(z.string(), day),
  cumulative: z.record(z.string(), detail),
  sessions: z.record(
    z.string(),
    z.object({
      totals,
      model: z.string().nullable(),
      context: z.object({ tokens: z.number(), window: z.number() }).nullable(),
      day,
    }),
  ),
  cursors: z.record(
    z.string(),
    z.object({
      offset: z.number().int().nonnegative(),
      carry: z.object({ sessionKey: z.string().optional(), model: z.string().optional() }),
      day,
    }),
  ),
})

/**
 * Usage lives in app data, so it survives restarts and transcripts being deleted: `ledger.jsonl`
 * is the append-only record of every entry; `state.json` holds the rollups and read positions,
 * saved now and then, with how much of the ledger they include.
 */
export class UsageFiles {
  constructor(private readonly paths: { readonly ledger: string; readonly state: string }) {}

  /** The saved state plus ledger entries written after it (e.g. before a crash). */
  async load(): Promise<UsageState> {
    const saved = await this.readState()
    const { entries, size } = await this.readLedgerFrom(saved.ledgerBytes)
    return { ...applyEntries(saved, entries), ledgerBytes: size }
  }

  /** Appends entries to the ledger; returns its new size. */
  async append(entries: readonly LedgerEntry[]): Promise<number> {
    if (entries.length > 0) {
      await appendFile(this.paths.ledger, entries.map((e) => `${JSON.stringify(e)}\n`).join(''))
    }
    return (await stat(this.paths.ledger).catch(() => null))?.size ?? 0
  }

  async save(state: UsageState): Promise<void> {
    await writeFileAtomic(this.paths.state, JSON.stringify(state))
  }

  private async readState(): Promise<UsageState> {
    const text = await readFile(this.paths.state, 'utf8').catch(() => null)
    if (text === null) return EMPTY_STATE
    try {
      const parsed = stateSchema.safeParse(JSON.parse(text))
      if (parsed.success) return parsed.data as UsageState
    } catch {
      // Falls through: rebuilt from the ledger below.
    }
    console.warn('[usage] state file unreadable; rebuilding totals from the ledger')
    return EMPTY_STATE
  }

  /** Entries after `offset`. A ledger shorter than that was replaced: the state already counts it. */
  private async readLedgerFrom(offset: number): Promise<{ entries: LedgerEntry[]; size: number }> {
    const file = await open(this.paths.ledger, 'r').catch(() => null)
    if (!file) return { entries: [], size: 0 }
    try {
      const { size } = await file.stat()
      if (size <= offset) return { entries: [], size }
      const buffer = Buffer.alloc(size - offset)
      await file.read(buffer, 0, buffer.length, offset)
      return { entries: parseLedger(buffer.toString('utf8')), size }
    } finally {
      await file.close()
    }
  }
}

function parseLedger(text: string): LedgerEntry[] {
  return text.split('\n').flatMap((line) => {
    if (!line.trim()) return []
    try {
      const parsed = ledgerEntrySchema.safeParse(JSON.parse(line))
      return parsed.success ? [parsed.data as LedgerEntry] : []
    } catch {
      return []
    }
  })
}
