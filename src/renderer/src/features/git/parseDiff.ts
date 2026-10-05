export type DiffLineKind = 'context' | 'added' | 'removed'

export interface DiffLine {
  readonly kind: DiffLineKind
  readonly text: string
  readonly oldLine: number | null
  readonly newLine: number | null
}

export interface DiffHunk {
  readonly header: string
  readonly lines: readonly DiffLine[]
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Parses a single-file unified diff into numbered hunks for display. */
export function parseDiff(text: string): DiffHunk[] {
  const hunks: { header: string; lines: DiffLine[] }[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of text.split('\n')) {
    const header = HUNK_HEADER.exec(raw)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      hunks.push({ header: raw, lines: [] })
      continue
    }
    const hunk = hunks.at(-1)
    if (!hunk) continue // file headers before the first hunk

    const marker = raw[0]
    const content = raw.slice(1)
    if (marker === '+')
      hunk.lines.push({ kind: 'added', text: content, oldLine: null, newLine: newLine++ })
    else if (marker === '-')
      hunk.lines.push({ kind: 'removed', text: content, oldLine: oldLine++, newLine: null })
    else if (marker === ' ')
      hunk.lines.push({ kind: 'context', text: content, oldLine: oldLine++, newLine: newLine++ })
  }
  return hunks
}
