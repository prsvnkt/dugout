import { isAbsolute, relative } from 'node:path'
import type { TimelineEvent, TouchedFile } from '@shared/timeline'

/**
 * What a transcript parser finds, before it becomes a timeline: each format (Claude, Codex)
 * turns its own entries into these steps, and `buildTimeline` does the rest the same way.
 */
export type TimelineStep =
  | { readonly kind: 'prompt'; readonly at: string; readonly text: string }
  /** `key` identifies a reply's text, so a repeated line (streamed, resumed) counts once. */
  | { readonly kind: 'message'; readonly at: string; readonly text: string; readonly key: string }
  | {
      readonly kind: 'call'
      readonly at: string
      readonly id: string
      readonly name: string
      readonly detail: string | null
      /** A subagent (Claude's Agent tool, Codex's spawn_agent), with its type when known. */
      readonly subagent: { readonly agentType: string | null } | null
      readonly files: readonly TouchedFile[]
    }
  | { readonly kind: 'result'; readonly id: string; readonly isError: boolean }
  /** The agent's own record of its last message for a turn (Codex `task_complete`). */
  | { readonly kind: 'final'; readonly text: string }

export interface TimelineParts {
  readonly events: readonly TimelineEvent[]
  readonly files: readonly TouchedFile[]
  readonly finalMessage: string | null
  readonly startedAt: string | null
  readonly endedAt: string | null
  readonly isTruncated: boolean
}

/** Caps that keep a timeline small enough to send to the renderer and show at once. */
export const TIMELINE_LIMITS = {
  events: 1500,
  files: 300,
  text: 2000,
  finalMessage: 8000,
  detail: 240,
} as const

/** Text cut to `max` characters, with an ellipsis when it was longer. */
export function shorten(text: string, max: number): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed
}

/** One line of a tool argument (commands span lines), cut to the detail limit. */
export function oneLine(text: string): string {
  return shorten(text.replace(/\s+/g, ' '), TIMELINE_LIMITS.detail)
}

/** A path relative to the session's folder when it is inside it, as shown in the timeline. */
export function displayPath(path: string, cwd: string | null): string {
  if (!cwd || !isAbsolute(path)) return path
  const inside = relative(cwd, path)
  return inside && !inside.startsWith('..') && !isAbsolute(inside) ? inside : path
}

const PATCH_HEADER = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/gm
const PATCH_MOVE = /^\*\*\* Move to: (.+)$/gm

/** Files an `apply_patch` envelope changes (Codex), in the order it names them. */
export function patchedFiles(text: string): readonly string[] {
  const names = [...text.matchAll(PATCH_HEADER), ...text.matchAll(PATCH_MOVE)]
  return [...new Set(names.map((match) => (match[1] ?? '').trim()).filter(Boolean))]
}

/** Files by path; an edit outranks a read. Most recently touched last, at most the file cap. */
function mergeFiles(steps: readonly TimelineStep[]): { files: TouchedFile[]; isCut: boolean } {
  const byPath = new Map<string, TouchedFile>()
  for (const step of steps) {
    if (step.kind !== 'call') continue
    for (const file of step.files) {
      const change = byPath.get(file.path)?.change === 'edited' ? 'edited' : file.change
      byPath.delete(file.path)
      byPath.set(file.path, { path: file.path, change })
    }
  }
  const files = [...byPath.values()]
  return { files: files.slice(-TIMELINE_LIMITS.files), isCut: files.length > TIMELINE_LIMITS.files }
}

function outcomeOf(id: string, results: ReadonlyMap<string, boolean>) {
  const isError = results.get(id)
  return isError === undefined ? 'pending' : isError ? 'failed' : 'ok'
}

function eventOf(step: TimelineStep, results: ReadonlyMap<string, boolean>): TimelineEvent | null {
  switch (step.kind) {
    case 'prompt':
      return { kind: 'prompt', at: step.at, text: shorten(step.text, TIMELINE_LIMITS.text) }
    case 'message':
      return { kind: 'message', at: step.at, text: shorten(step.text, TIMELINE_LIMITS.text) }
    case 'call': {
      const outcome = outcomeOf(step.id, results)
      return step.subagent
        ? {
            kind: 'subagent',
            at: step.at,
            id: step.id,
            agentType: step.subagent.agentType,
            detail: step.detail,
            outcome,
          }
        : { kind: 'tool', at: step.at, id: step.id, name: step.name, detail: step.detail, outcome }
    }
    default:
      return null
  }
}

/** A step seen before (a repeated line), which must not show twice. */
function dedupeKey(step: TimelineStep): string | null {
  if (step.kind === 'call') return `call:${step.id}`
  if (step.kind === 'message') return `message:${step.key}`
  return null
}

/**
 * The timeline from a transcript's steps: tool calls get the outcome of their result, repeated
 * lines count once, the final message is the agent's last word, and long sessions keep their
 * most recent events (`isTruncated` says so).
 */
export function buildTimeline(steps: readonly TimelineStep[]): TimelineParts {
  const results = new Map<string, boolean>()
  for (const step of steps) {
    if (step.kind === 'result') results.set(step.id, results.get(step.id) === true || step.isError)
  }
  const seen = new Set<string>()
  const unique = steps.filter((step) => {
    const key = dedupeKey(step)
    if (key === null) return true
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const events = unique.flatMap((step) => eventOf(step, results) ?? [])
  const { files, isCut } = mergeFiles(unique)
  const lastFinal = unique.findLast((step) => step.kind === 'final')
  const lastMessage = unique.findLast((step) => step.kind === 'message')
  const finalText =
    lastFinal?.kind === 'final'
      ? lastFinal.text
      : lastMessage?.kind === 'message'
        ? lastMessage.text
        : null
  const kept = events.slice(-TIMELINE_LIMITS.events)
  const times = events.map((event) => event.at).filter(Boolean)
  return {
    events: kept,
    files,
    finalMessage: finalText ? shorten(finalText, TIMELINE_LIMITS.finalMessage) : null,
    startedAt: times[0] ?? null,
    endedAt: times.at(-1) ?? null,
    isTruncated: isCut || kept.length < events.length,
  }
}
