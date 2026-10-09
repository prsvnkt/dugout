import type { AgentKind } from '@shared/agents'
import { MAX_CONTEXT_BODY_LENGTH } from '@shared/context'
import type { AgentAdapter } from '../agents/AgentAdapter'
import type { HeadlessRunner } from '../agents/runHeadless'

export const CODEMAP_PROMPT = [
  'Write a concise codemap of this repository for other coding agents, in Markdown.',
  'Cover the main folders and what each holds, the entry points and key files, how the parts',
  'connect, and where to look for common changes. Keep it under 150 lines.',
  'Do not change any files. Reply with only the Markdown.',
].join(' ')

export interface CodemapDeps {
  readonly adapter: (kind: AgentKind) => AgentAdapter
  readonly commands: Readonly<Record<AgentKind, string>>
  readonly run: HeadlessRunner
}

/** Asks the user's own agent (headless) to map the codebase at `root`; resolves to Markdown. */
export async function buildCodemap(deps: CodemapDeps, agent: AgentKind, root: string) {
  const adapter = deps.adapter(agent)
  if (!adapter.headless) throw new Error(`${adapter.info.label} cannot build a codemap.`)
  const output = await deps.run(adapter.headless(deps.commands[agent]), root, CODEMAP_PROMPT)
  const markdown = output.trim()
  if (!markdown) throw new Error(`${adapter.info.label} returned an empty codemap.`)
  return markdown.slice(0, MAX_CONTEXT_BODY_LENGTH)
}
