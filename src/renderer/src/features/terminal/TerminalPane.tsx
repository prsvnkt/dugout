import { useRef, type CSSProperties } from 'react'
import '@xterm/xterm/css/xterm.css'
import type { TerminalKind } from '@shared/terminal'
import { useTerminal, type TerminalStatus } from './useTerminal'
import styles from './TerminalPane.module.css'

interface TerminalPaneProps {
  readonly kind: TerminalKind
  readonly cwd: string
  readonly accentColor: string
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

function folderName(path: string): string {
  return path.split('/').filter(Boolean).at(-1) ?? path
}

export function TerminalPane({ kind, cwd, accentColor }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const status = useTerminal(containerRef, kind, cwd)

  return (
    <section className={styles.pane} style={{ '--accent': accentColor } as CSSProperties}>
      <header className={styles.header}>
        <span className={styles.title}>{folderName(cwd)}</span>
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        <span className={styles.status} data-state={status.state} title={cwd}>
          <span className={styles.statusDot} aria-hidden />
          {describeStatus(status)}
        </span>
      </header>
      <div ref={containerRef} className={styles.terminal} data-testid="terminal" />
    </section>
  )
}
