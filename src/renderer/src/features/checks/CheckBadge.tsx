import { CircleCheck, CircleX, LoaderCircle, type LucideIcon } from 'lucide-react'
import { Icon } from '@renderer/lib/Icon'
import { checkLabel, type ActiveCheck } from './checks'
import styles from './Checks.module.css'

const ICON: Readonly<Record<ActiveCheck['state'], LucideIcon>> = {
  running: LoaderCircle,
  passed: CircleCheck,
  failed: CircleX,
}

const MS_PER_SECOND = 1_000

/** Tooltip: the command, and how long it took or how it ended. */
export function checkTitle(check: ActiveCheck): string {
  if (check.state === 'running') return `Running ${check.command}`
  if (check.state === 'passed') {
    return `${check.command} passed in ${Math.max(1, Math.round(check.durationMs / MS_PER_SECOND))}s`
  }
  return check.exitCode === null
    ? `${check.command} was stopped`
    : `${check.command} exited with code ${check.exitCode}`
}

interface CheckBadgeProps {
  readonly check: ActiveCheck
  /** Icon only (the label is still the accessible name and the tooltip). */
  readonly isCompact?: boolean
}

/** Verify on Stop's result: an icon plus words, so it never relies on colour alone. */
export function CheckBadge({ check, isCompact = false }: CheckBadgeProps) {
  const label = checkLabel(check)
  return (
    <span
      className={styles.badge}
      data-check={check.state}
      title={checkTitle(check)}
      aria-label={isCompact ? label : undefined}
      role={isCompact ? 'img' : undefined}
    >
      <Icon icon={ICON[check.state]} className={styles.icon} />
      {!isCompact && <span className={styles.label}>{label}</span>}
    </span>
  )
}
