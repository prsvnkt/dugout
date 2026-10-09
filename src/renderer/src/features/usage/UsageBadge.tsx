import { TriangleAlert } from 'lucide-react'
import { headlineTokens, type AgentUsage } from '@shared/usage'
import { Icon } from '@renderer/lib/Icon'
import { contextPercent, formatTokens, isContextNearlyFull, usageBreakdown } from './usageFormat'
import styles from './Usage.module.css'

interface UsageBadgeProps {
  readonly usage: AgentUsage
  readonly className?: string | undefined
}

/**
 * An agent header's usage: tokens this session and how full the context window is ("12.3k ·
 * 34% context"), with a warning icon from 80%, when the agent may soon compact.
 */
export function UsageBadge({ usage, className }: UsageBadgeProps) {
  const tokens = formatTokens(headlineTokens(usage.totals))
  const percent = usage.context ? contextPercent(usage.context) : null
  const isNearlyFull = usage.context ? isContextNearlyFull(usage.context) : false
  const contextLine =
    usage.context && percent !== null
      ? `Context: ${formatTokens(usage.context.tokens)} of ${formatTokens(usage.context.window)} (${percent}%)${isNearlyFull ? ', may compact soon' : ''}`
      : null
  const title = [
    `Tokens this session: ${tokens}${usage.model ? ` (${usage.model})` : ''}`,
    contextLine,
    usageBreakdown(usage.totals),
  ]
    .filter(Boolean)
    .join('\n')
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      data-warn={isNearlyFull}
      title={title}
      role="note"
      aria-label={`Tokens this session: ${tokens}${percent !== null ? `, context ${percent}% full` : ''}`}
      data-testid="agent-usage"
    >
      <span>{tokens} tok</span>
      {percent !== null && (
        <span className={styles.context}>
          {isNearlyFull && <Icon icon={TriangleAlert} />}
          {percent}% ctx
        </span>
      )}
    </span>
  )
}
