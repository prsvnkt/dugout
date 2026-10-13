import { useCallback, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { AgentKind } from '@shared/agents'
import { Icon } from '@renderer/lib/Icon'
import { useMenuKeys } from '@renderer/lib/useArrowNavigation'
import { useDismiss } from '@renderer/lib/useDismiss'
import type { TaskStartOption } from './taskStartOptions'
import styles from './TaskDetailView.module.css'

interface AgentChoiceMenuProps {
  readonly label: string
  /** The button's tooltip: what choosing an agent does. */
  readonly title: string
  readonly options: readonly TaskStartOption[]
  readonly isPrimary?: boolean
  readonly disabled: boolean
  onChoose(agents: readonly AgentKind[]): void
}

/** A button that opens a menu of agents to start (or queue) on the task. */
export function AgentChoiceMenu(props: AgentChoiceMenuProps) {
  const { label, title, options, isPrimary = false, disabled, onChoose } = props
  const [isOpen, setIsOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setIsOpen(false), [])
  useDismiss(ref, isOpen, close, triggerRef)
  const onMenuKeyDown = useMenuKeys(menuRef, isOpen)
  return (
    <span className={styles.startMenu} ref={ref}>
      <button
        ref={triggerRef}
        className={isPrimary ? `${styles.button} ${styles.primary}` : styles.button}
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={title}
      >
        {label}
        <Icon icon={ChevronDown} />
      </button>
      {isOpen && (
        <span
          className={styles.menu}
          role="menu"
          aria-label={label}
          ref={menuRef}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option) => (
            <button
              key={option.label}
              role="menuitem"
              onClick={() => {
                setIsOpen(false)
                onChoose(option.agents)
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
