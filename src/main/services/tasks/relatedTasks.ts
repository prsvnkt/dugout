/** "#" for GitHub ("Related: #3"), the team key and a dash for Linear ("Related: ENG-3"). */
export const GITHUB_KEY_PREFIX = '#'

function relatedLine(prefix: string): RegExp {
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^Related: ${escaped}(\\d+)\\s*$`, 'gm')
}

/** Task numbers already listed as "Related: <prefix>n" lines in a description. */
export function relatedIn(body: string, prefix = GITHUB_KEY_PREFIX): number[] {
  return [...body.matchAll(relatedLine(prefix))].map((match) => Number(match[1]))
}

/**
 * The description with a "Related: <prefix>n" line for each task not already listed. GitHub
 * links "#n" and Linear links "ENG-n", and both show the mention on the other task.
 */
export function withRelated(
  body: string,
  related: readonly number[],
  prefix = GITHUB_KEY_PREFIX,
): string {
  const existing = new Set(relatedIn(body, prefix))
  const lines = [...new Set(related)]
    .filter((number) => !existing.has(number))
    .map((number) => `Related: ${prefix}${number}`)
  if (lines.length === 0) return body
  const trimmed = body.trimEnd()
  const separator = trimmed === '' ? '' : existing.size > 0 ? '\n' : '\n\n'
  return `${trimmed}${separator}${lines.join('\n')}`
}
