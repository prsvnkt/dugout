import type { ProjectColor } from '@shared/project'

/** CSS custom property holding a project colour, defined in styles/tokens.css. */
export function projectColorVar(color: ProjectColor): string {
  return `var(--project-${color})`
}
