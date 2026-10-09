import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Send, X } from 'lucide-react'
import { CHECK_IDLE, type CheckStatus } from '@shared/checks'
import { Icon } from '@renderer/lib/Icon'
import { useDismiss } from '@renderer/lib/useDismiss'
import { CheckBadge, checkTitle } from './CheckBadge'
import type { FailedCheck } from './checks'
import { useCheckStore } from './checkStore'
import { sendCheckFailure } from './sendCheckFailure'
import styles from './Checks.module.css'

const POPOVER_WIDTH_PX = 520
const POPOVER_GAP_PX = 4

interface OpenPopover {
  readonly check: CheckStatus
  readonly style: CSSProperties
}

interface FailurePopoverProps {
  readonly terminalId: string
  readonly check: FailedCheck
  readonly style: CSSProperties
  onClose(): void
}

function FailurePopover({ terminalId, check, style, onClose }: FailurePopoverProps) {
  const [error, setError] = useState<string | null>(null)
  const sendRef = useRef<HTMLButtonElement>(null)
  useEffect(() => sendRef.current?.focus(), [])

  const [isSending, setIsSending] = useState(false)
  const send = async () => {
    setIsSending(true)
    const message = await sendCheckFailure(terminalId, check)
    setIsSending(false)
    if (message === null) onClose()
    else setError(message)
  }

  return (
    <div className={styles.popover} style={style} role="dialog" aria-label="Check failed">
      <p className={styles.summary}>{checkTitle(check)}</p>
      <pre className={styles.output} aria-label="Check output" tabIndex={0}>
        {check.output || 'It printed nothing.'}
      </pre>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button
          ref={sendRef}
          className={styles.primary}
          onClick={() => void send()}
          disabled={isSending}
        >
          <Icon icon={Send} />
          Send failure to agent
        </button>
        <button className={styles.secondary} onClick={onClose} aria-label="Close" title="Close">
          <Icon icon={X} />
        </button>
      </div>
    </div>
  )
}

/**
 * Verify on Stop in an agent's header: checking, passed, or failed. A failure opens its output
 * with "Send failure to agent".
 */
export function CheckIndicator({ terminalId }: { terminalId: string | null }) {
  const check = useCheckStore((state) =>
    terminalId ? (state.byTerminal[terminalId] ?? CHECK_IDLE) : CHECK_IDLE,
  )
  // Fixed to the window: pane headers clip anything that overflows them. Tied to the check it
  // opened for, so a new check (or a new turn) closes the old one's output.
  const [popover, setPopover] = useState<OpenPopover | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setPopover(null), [])
  const isOpen = popover !== null && popover.check === check
  useDismiss(wrapRef, isOpen, close)

  if (!terminalId || check.state === 'idle') return null
  if (check.state !== 'failed') return <CheckBadge check={check} />

  const toggle = (button: HTMLElement) => {
    if (isOpen) return close()
    const rect = button.getBoundingClientRect()
    setPopover({
      check,
      style: {
        top: rect.bottom + POPOVER_GAP_PX,
        left: Math.max(POPOVER_GAP_PX, rect.right - POPOVER_WIDTH_PX),
        width: POPOVER_WIDTH_PX,
      },
    })
  }

  return (
    // Keeps the click from focusing the terminal under the pane header.
    <div className={styles.wrap} ref={wrapRef} onMouseDown={(event) => event.stopPropagation()}>
      <button
        className={styles.trigger}
        onClick={(event) => toggle(event.currentTarget)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Show the check output"
      >
        <CheckBadge check={check} />
      </button>
      {isOpen && (
        <FailurePopover
          terminalId={terminalId}
          check={check}
          style={popover.style}
          onClose={close}
        />
      )}
    </div>
  )
}
