/** In the order new projects get them. The greens come last: they sit close to the accent. */
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
}

export const MAX_PROJECT_NAME_LENGTH = 60

/** Default name for a new project: the repo folder's name. */
export function suggestProjectName(rootPath: string): string {
  const folder = rootPath.split('/').filter(Boolean).at(-1) ?? 'Project'
  return folder.slice(0, MAX_PROJECT_NAME_LENGTH)
}

/** The first colour no project uses yet, cycling once every colour is taken. */
export function nextProjectColor(projects: readonly Pick<Project, 'color'>[]): ProjectColor {
  const used = new Set(projects.map((project) => project.color))
  const unused = PROJECT_COLORS.find((color) => !used.has(color))
  return unused ?? PROJECT_COLORS[projects.length % PROJECT_COLORS.length] ?? 'blue'
}
