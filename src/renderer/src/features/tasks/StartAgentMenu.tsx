import { useCallback, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AGENT_LIST, type AgentKind } from '@shared/agents'
import { Icon } from '@renderer/lib/Icon'
import { useDismiss } from '@renderer/lib/useDismiss'
import { taskStartOptions } from './taskStartOptions'
import styles from './TaskDetailView.module.css'

const START_OPTIONS = taskStartOptions(AGENT_LIST)

interface StartAgentMenuProps {
  readonly label: string
  readonly disabled: boolean
  onStart(agents: readonly AgentKind[]): void
}

/** Which agent(s) to start on the task, each in its own worktree. */
export function StartAgentMenu({ label, disabled, onStart }: StartAgentMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(ref, isOpen, close)
  return (
    <span className={styles.startMenu} ref={ref}>
      <button
        className={`${styles.button} ${styles.primary}`}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="Start an agent in a new worktree with this task as its first prompt"
      >
        {label}
        <Icon icon={ChevronDown} />
      </button>
      {isOpen && (
        <span className={styles.menu} role="menu">
          {START_OPTIONS.map((option) => (
            <button
              key={option.label}
              role="menuitem"
              onClick={() => {
                setIsOpen(false)
                onStart(option.agents)
              }}
            >
              {option.label}
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
