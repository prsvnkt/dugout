import type { InstructionsStatus, OwnInstructions } from '@shared/agentConfig'
import { AGENT_LIST, AGENTS, SHARED_INSTRUCTIONS_FILE, type AgentInfo } from '@shared/agents'
import { listText } from '@renderer/lib/listText'

export interface InstructionsText {
  /** Whether every agent's own file already imports the shared instructions. */
  readonly isLinked: boolean
  readonly text: string
}

/** The file an agent reads: the one it has, else the one it would create first. */
export function ownFilePath(own: OwnInstructions): string {
  return own.path ?? AGENTS[own.kind].instructionsFiles[0] ?? SHARED_INSTRUCTIONS_FILE
}

/**
 * The Agent instructions section's text, from which files each agent reads (`instructionsFiles`)
 * and the status main reported, so no agent or file is named here.
 */
export function instructionsText(
  status: InstructionsStatus,
  agents: readonly AgentInfo[] = AGENT_LIST,
): InstructionsText {
  const shared = SHARED_INSTRUCTIONS_FILE
  const paths = status.ownFiles.map(ownFilePath)
  if (status.ownFiles.every((own) => own.importsShared)) {
    if (paths.length === 0) return { isLinked: true, text: `Every agent reads ${shared}.` }
    const verb = paths.length === 1 ? 'imports' : 'import'
    const text = `${listText(paths)} ${verb} ${shared}, so every agent follows the same instructions.`
    return { isLinked: true, text }
  }
  const readers = agents.filter((agent) => agent.instructionsFiles.includes(shared))
  const readVerb = readers.length === 1 ? 'reads' : 'read'
  const ownLabels = status.ownFiles.map((own) => AGENTS[own.kind].label)
  const who = [
    ...(readers.length > 0
      ? [`${listText(readers.map((a) => a.label))} ${readVerb} ${shared}`]
      : []),
    ...status.ownFiles.map((_own, index) => `${ownLabels[index]} reads ${paths[index]}`),
  ].join('; ')
  const notes = listText(ownLabels.map((label) => `${label}-only`))
  const current = status.hasSharedFile ? undefined : status.ownFiles.find((own) => own.path)?.path
  return {
    isLinked: false,
    text:
      `${who}. Make ${shared} the single source and have ${listText(paths)} import it, keeping ` +
      `a section for ${notes} notes.${current ? ` The current ${current} becomes ${shared}.` : ''}`,
  }
}
