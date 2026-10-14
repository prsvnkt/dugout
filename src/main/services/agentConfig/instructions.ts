const NEW_SHARED_INSTRUCTIONS = '# Agent instructions\n'

/** Whether `text` has `importLine` (e.g. `@AGENTS.md`) as a line of its own. */
export function importsShared(text: string, importLine: string): boolean {
  return text.split(/\r?\n/).some((candidate) => candidate.trim() === importLine)
}

export interface LinkInput {
  /** AGENTS.md, or null when it does not exist. */
  readonly shared: string | null
  /** The agent's own instructions file (e.g. CLAUDE.md), or null when it does not exist. */
  readonly own: string | null
  /** The line that makes the own file import AGENTS.md, from the agent's adapter. */
  readonly importLine: string
  /** Heading for notes only that agent reads, e.g. `## Claude-only notes`. */
  readonly heading: string
}

/**
 * Makes AGENTS.md the instructions every agent reads, with the agent's own file importing it.
 * Existing own-file content becomes AGENTS.md when there is none yet; otherwise it stays below
 * the import.
 */
export function linkInstructions(input: LinkInput): { shared: string; own: string } {
  const { shared, own, importLine } = input
  if (own !== null && importsShared(own, importLine)) {
    return { shared: shared ?? NEW_SHARED_INSTRUCTIONS, own }
  }
  if (shared === null) {
    return {
      shared: own?.trim() ? own : NEW_SHARED_INSTRUCTIONS,
      own: `${importLine}\n\n${input.heading}\n`,
    }
  }
  return { shared, own: own ? `${importLine}\n\n${own}` : `${importLine}\n` }
}
