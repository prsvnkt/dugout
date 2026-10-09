const RELATED_LINE = /^Related: #(\d+)\s*$/gm

/** Task numbers already listed as "Related: #n" lines in a description. */
export function relatedIn(body: string): number[] {
  return [...body.matchAll(RELATED_LINE)].map((match) => Number(match[1]))
}

/**
 * The description with a "Related: #n" line for each task not already listed. GitHub links
 * "#n" to the issue and shows the mention on the other issue's timeline.
 */
export function withRelated(body: string, related: readonly number[]): string {
  const existing = new Set(relatedIn(body))
  const lines = [...new Set(related)]
    .filter((number) => !existing.has(number))
    .map((number) => `Related: #${number}`)
  if (lines.length === 0) return body
  const trimmed = body.trimEnd()
  const separator = trimmed === '' ? '' : existing.size > 0 ? '\n' : '\n\n'
  return `${trimmed}${separator}${lines.join('\n')}`
}
