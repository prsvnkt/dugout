import type { LucideIcon } from 'lucide-react'
import styles from './Icon.module.css'

/** Icon sizes in px: the activity rail, and every other control (panel headers, tabs, rows). */
const ICON_SIZE_PX = { rail: 18, control: 14 } as const
/** Rendered stroke in px, the same at every size (decision 035). */
const STROKE_WIDTH_PX = 1.5

interface IconProps {
  /** A Lucide icon, imported by name from `lucide-react` so only used icons are bundled. */
  readonly icon: LucideIcon
  readonly size?: keyof typeof ICON_SIZE_PX
  readonly className?: string | undefined
}

/**
 * One icon from the app's set: drawn in `currentColor` (so hover, active and project-colour
 * states apply), fixed size and stroke, and hidden from screen readers. The button around it
 * carries the name (`aria-label`) and tooltip (`title`).
 */
export function Icon({ icon: Glyph, size = 'control', className }: IconProps) {
  return (
    <Glyph
      className={className ? `${styles.icon} ${className}` : styles.icon}
      size={ICON_SIZE_PX[size]}
      strokeWidth={STROKE_WIDTH_PX}
      absoluteStrokeWidth
      aria-hidden
      focusable={false}
    />
  )
}
