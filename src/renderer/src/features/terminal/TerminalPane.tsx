import { useEffect, useRef, type CSSProperties } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { TerminalKind } from '@shared/terminal'
import { useTerminal, type TerminalStatus } from './useTerminal'
import styles from './TerminalPane.module.css'

interface TerminalPaneProps {
  readonly kind: TerminalKind
  readonly cwd: string
  readonly accentColor: string
  /** True when this pane should own keyboard focus (focused pane of the visible project). */
  readonly shouldFocus: boolean
  readonly isFocused: boolean
  onFocus(): void
  onClose(): void
}

const KIND_LABEL: Record<TerminalKind, string> = { claude: 'Claude Code', shell: 'Shell' }

function describeStatus(status: TerminalStatus): string {
  switch (status.state) {
    case 'starting':
      return 'Starting…'
    case 'running':
      return 'Running'
    case 'exited':
      return `Exited (${status.exit.exitCode})`
    case 'error':
      return status.message
  }
}

export function TerminalPane(props: TerminalPaneProps) {
  const { kind, cwd, accentColor, shouldFocus, isFocused, onFocus, onClose } = props
  const containerRef = useRef<HTMLDivElement>(null)
  const { status, focus } = useTerminal(containerRef, kind, cwd)

  useEffect(() => {
    if (shouldFocus) focus()
  }, [shouldFocus, focus])

  return (
    <section
      className={styles.pane}
      data-focused={isFocused}
      style={{ '--accent': accentColor } as CSSProperties}
      onMouseDown={onFocus}
      aria-label={`${KIND_LABEL[kind]} terminal`}
    >
      <header className={styles.header}>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        <span className={styles.status} data-state={status.state}>
          <span className={styles.statusDot} aria-hidden />
          {describeStatus(status)}
        </span>
        <button
          className={styles.close}
          onClick={onClose}
          onMouseDown={(event) => event.stopPropagation()}
          aria-label={`Close ${KIND_LABEL[kind]} pane`}
          title="Close pane (⌘W)"
        >
          ×
        </button>
      </header>
      <div ref={containerRef} className={styles.terminal} data-testid="terminal" />
    </section>
  )
}
