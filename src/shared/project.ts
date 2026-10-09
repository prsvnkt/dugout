import type { TaskSource } from './tasks'

export const PROJECT_COLORS = [
  'blue',
  'orange',
  'purple',
  'pink',
  'yellow',
  'red',
  'teal',
  'green',
] as const

export type ProjectColor = (typeof PROJECT_COLORS)[number]

export type ProjectId = string

export interface Project {
  readonly id: ProjectId
  readonly name: string
  /** Absolute path to the top level of the project's git repository. */
  readonly rootPath: string
  readonly color: ProjectColor
  readonly createdAt: string
  /** What "Run" starts in a new shell with an assigned `PORT`, e.g. `npm run dev`. */
  readonly devCommand?: string
  /** What Verify on Stop runs when an agent finishes, e.g. `npm run check`. Off when unset. */
  readonly checkCommand?: string
  /** Where the project's tasks live; GitHub Issues when missing. */
  readonly taskSource?: TaskSource | undefined
}

export const MAX_PROJECT_NAME_LENGTH = 60

/** A project's name: always its repo folder's name. */
export function suggestProjectName(rootPath: string): string {
  const folder = rootPath.split('/').filter(Boolean).at(-1) ?? 'Project'
  return folder.slice(0, MAX_PROJECT_NAME_LENGTH)
}

/**
 * A random colour no project uses yet, or any colour once all are taken. `random` returns a
 * number in [0, 1), like Math.random.
 */
export function pickProjectColor(
  projects: readonly Pick<Project, 'color'>[],
  random: () => number,
): ProjectColor {
  const used = new Set(projects.map((project) => project.color))
  const unused = PROJECT_COLORS.filter((color) => !used.has(color))
  const candidates = unused.length > 0 ? unused : PROJECT_COLORS
  return candidates[Math.floor(random() * candidates.length)] ?? PROJECT_COLORS[0]
}
