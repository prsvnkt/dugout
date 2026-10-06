import { posix } from 'node:path'

export const AGENTS_MD = 'AGENTS.md'
/** Where Claude Code looks for project instructions, in the order Dugout prefers them. */
export const CLAUDE_MD_PATHS = ['CLAUDE.md', '.claude/CLAUDE.md'] as const

const NEW_AGENTS_MD = '# Agent instructions\n'
const CLAUDE_ONLY_HEADING = '## Claude-only notes\n'

/** The `@` import of AGENTS.md as written in the CLAUDE.md at `claudePath` (imports are relative). */
export function agentsImport(claudePath: string): string {
  return `@${posix.relative(posix.dirname(claudePath), AGENTS_MD)}`
}

export function importsAgentsMd(claude: string, claudePath: string): boolean {
  const line = agentsImport(claudePath)
  return claude.split(/\r?\n/).some((candidate) => candidate.trim() === line)
}

/**
 * Makes AGENTS.md the instructions every agent reads, with CLAUDE.md importing it. Existing
 * CLAUDE.md content becomes AGENTS.md when there is none yet; otherwise it stays below the import.
 */
export function linkInstructions(files: {
  readonly agents: string | null
  readonly claude: string | null
  readonly claudePath: string
}): { agents: string; claude: string } {
  const importLine = agentsImport(files.claudePath)
  if (files.claude !== null && importsAgentsMd(files.claude, files.claudePath)) {
    return { agents: files.agents ?? NEW_AGENTS_MD, claude: files.claude }
  }
  if (files.agents === null) {
    return {
      agents: files.claude?.trim() ? files.claude : NEW_AGENTS_MD,
      claude: `${importLine}\n\n${CLAUDE_ONLY_HEADING}`,
    }
  }
  return {
    agents: files.agents,
    claude: files.claude ? `${importLine}\n\n${files.claude}` : `${importLine}\n`,
  }
}
