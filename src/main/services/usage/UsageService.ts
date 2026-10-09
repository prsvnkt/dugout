import { realpath } from 'node:fs/promises'
import { isAbsolute, sep } from 'node:path'
import type { AgentKind } from '@shared/agents'
import type { AgentUsage, ProjectUsage } from '@shared/usage'
import type { AgentUsageReader } from '../agents/AgentAdapter'
import { readLinesFrom } from '../transcripts/jsonlTail'
import type { ContextReading } from '../transcripts/types'
import { contextWindowOf } from './prices'
import { daysBefore, projectUsage } from './projectUsage'
import type { UsageFiles } from './usageFiles'
import {
  applyEntries,
  EMPTY_STATE,
  entriesFor,
  localDay,
  prune,
  withContext,
  withCursor,
  type Attribution,
  type UsageState,
} from './usageState'

/** Dedupe ids, sessions and read positions untouched for this long are forgotten. */
const RETENTION_DAYS = 120
const TRANSCRIPT_EXTENSION = '.jsonl'

export interface UsageReaderSource {
  readonly reader: AgentUsageReader
  /** The folder its transcripts must be in (resolved once at start). */
  readonly root: string
}

export interface UsageServiceDeps {
  readonly files: Pick<UsageFiles, 'load' | 'append' | 'save'>
  readonly readers: Readonly<Partial<Record<AgentKind, UsageReaderSource>>>
  readonly now: () => Date
  /** Debounces saving the state; tests pass one that runs at once. */
  readonly scheduleSave: (save: () => void) => void
}

/** A transcript a hook pointed at, and what its usage belongs to. */
export interface TranscriptReport {
  readonly attribution: Attribution
  readonly transcriptPath: string
  /** Subagent transcripts add to the session's totals but say nothing about its context. */
  readonly isSubagent: boolean
}

function contextUsage(reading: ContextReading | null) {
  if (!reading) return null
  const window = reading.window ?? contextWindowOf(reading.model)
  return window ? { tokens: reading.tokens, window } : null
}

/**
 * Dugout's own token ledger. Hook events name the transcript an agent writes; each report reads
 * only what was added since the last one, counts every reply once, and attributes it to the
 * terminal's project, task and session. Reports are handled one at a time, in order.
 */
export class UsageService {
  private state: UsageState = EMPTY_STATE
  private queue: Promise<unknown> = Promise.resolve()
  private isSaveScheduled = false

  constructor(private readonly deps: UsageServiceDeps) {}

  async load(): Promise<void> {
    this.state = await this.deps.files.load()
  }

  /** Reads the new part of a transcript; resolves to the session's usage, or null if unreadable. */
  report(report: TranscriptReport): Promise<AgentUsage | null> {
    const run = this.queue.then(() => this.read(report))
    this.queue = run.catch(() => undefined)
    return run.catch((error: unknown) => {
      console.warn('[usage] could not read a transcript:', error)
      return null
    })
  }

  /** The session's usage so far, e.g. for a resumed session before its first new reply. */
  sessionUsage(sessionId: string): AgentUsage | null {
    const session = this.state.sessions[sessionId]
    return session ? { sessionId, ...session } : null
  }

  projectUsage(projectId: string): ProjectUsage {
    return projectUsage(this.state, projectId, localDay(this.deps.now()))
  }

  /** Writes the state now (e.g. when the app quits). */
  async flush(): Promise<void> {
    await this.queue
    await this.deps.files.save(this.state)
  }

  private async read({ attribution, transcriptPath, isSubagent }: TranscriptReport) {
    const source = this.deps.readers[attribution.agent]
    const path = source && (await allowedPath(transcriptPath, source.root))
    if (!source || !path) return this.sessionUsage(attribution.sessionId)

    const now = this.deps.now()
    const today = localDay(now)
    const cursor = this.state.cursors[path]
    const { lines, nextOffset } = await readLinesFrom(path, cursor?.offset ?? 0)
    const usage = source.reader.read(lines, cursor?.carry ?? {}, path)
    const entries = entriesFor(this.state, usage.observations, attribution, now)
    const ledgerBytes = await this.deps.files.append(entries)

    let next = applyEntries(this.state, entries)
    if (!isSubagent && usage.context) {
      const context = contextUsage(usage.context)
      next = withContext(next, attribution.sessionId, usage.context.model, context, today)
    }
    next = withCursor(next, path, { offset: nextOffset, carry: usage.carry, day: today })
    this.state = { ...next, ledgerBytes }
    this.requestSave()
    return this.sessionUsage(attribution.sessionId)
  }

  private requestSave(): void {
    if (this.isSaveScheduled) return
    this.isSaveScheduled = true
    this.deps.scheduleSave(() => {
      this.isSaveScheduled = false
      this.state = prune(this.state, daysBefore(localDay(this.deps.now()), RETENTION_DAYS))
      this.deps.files.save(this.state).catch((error: unknown) => {
        console.warn('[usage] could not save usage totals:', error)
      })
    })
  }
}

/**
 * The transcript's real path if it is a `.jsonl` file inside `root` (symlinks resolved), else
 * null. Hook payloads come from the agent, so a path is never read just because it was sent.
 */
export async function allowedPath(path: string, root: string): Promise<string | null> {
  if (!isAbsolute(path) || !path.endsWith(TRANSCRIPT_EXTENSION)) return null
  const [real, realRoot] = await Promise.all([
    realpath(path).catch(() => null),
    realpath(root).catch(() => null),
  ])
  if (!real || !realRoot || !real.endsWith(TRANSCRIPT_EXTENSION)) return null
  return real.startsWith(realRoot + sep) ? real : null
}
