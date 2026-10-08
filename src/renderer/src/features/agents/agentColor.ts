import { PROJECT_COLORS, type ProjectColor } from '@shared/project'
import { isAgentKind } from '@shared/terminal'
import type { Pane } from '@renderer/features/workspace/layout'

/**
 * The colour for a new agent: the first palette colour no other agent in the project uses,
 * never the project's own (that is the room accent). Repeats once every colour is taken.
 */
export function pickAgentColor(
  used: readonly ProjectColor[],
  projectColor: ProjectColor | undefined,
): ProjectColor {
  const candidates = PROJECT_COLORS.filter((color) => color !== projectColor)
  const unused = candidates.find((color) => !used.includes(color))
  return unused ?? candidates[used.length % candidates.length] ?? PROJECT_COLORS[0]
}

/** Gives every agent pane without a colour one (e.g. layouts saved before agent colours). */
export function assignAgentColors(
  panes: readonly Pane[],
  projectColor: ProjectColor | undefined,
): readonly Pane[] {
  if (panes.every((pane) => pane.color || !isAgentKind(pane.kind))) return panes
  return panes.reduce<readonly Pane[]>((done, pane, index) => {
    if (pane.color || !isAgentKind(pane.kind)) return [...done, pane]
    const used = [...done, ...panes.slice(index + 1)].flatMap((other) => other.color ?? [])
    return [...done, { ...pane, color: pickAgentColor(used, projectColor) }]
  }, [])
}
