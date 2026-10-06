import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import type { AgentStatus } from '@shared/agentStatus'
import type { TerminalExit, TerminalKind } from '@shared/terminal'
import { dugout } from '@renderer/lib/dugout'
import { XTERM_OPTIONS } from './xtermOptions'

export type TerminalStatus =
  | { readonly state: 'starting' }
  | { readonly state: 'running' }
  | { readonly state: 'exited'; readonly exit: TerminalExit }
  | { readonly state: 'error'; readonly message: string }

export interface TerminalHandle {
  readonly status: TerminalStatus
  /** Claude terminals only; null for shells or before the first hook fires. */
  readonly agentStatus: AgentStatus | null
  /** The main-process terminal id, once the PTY has started. */
  readonly terminalId: string | null
  /** The Claude session id reported by hooks (Claude terminals only). */
  readonly sessionId: string | null
  focus(): void
}

function loadWebgl(terminal: Terminal): void {
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    terminal.loadAddon(webgl)
  } catch (error) {
    console.warn('[terminal] WebGL renderer unavailable, using DOM renderer', error)
  }
}

/**
 * Below this the container is still being laid out (new split panes mount at ~0 width) or
 * hidden. Fitting then would shrink the PTY to a couple of columns and garble the TUI.
 */
const MIN_MEASURABLE_PX = 50

function hasUsableSize(container: HTMLElement): boolean {
  return container.clientWidth >= MIN_MEASURABLE_PX && container.clientHeight >= MIN_MEASURABLE_PX
}

/** Mounts an xterm into `containerRef` and connects it to a new PTY in the main process. */
export interface TerminalOptions {
  readonly kind: TerminalKind
  readonly projectId: string
  readonly cwd: string
  /** Claude session to resume. Read once at start; later changes do not restart the PTY. */
  readonly resumeSessionId?: string | undefined
  /** First message for a new session. Read once at start. */
  readonly initialPrompt?: string | undefined
}

export function useTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  { kind, projectId, cwd, resumeSessionId, initialPrompt }: TerminalOptions,
): TerminalHandle {
  const [status, setStatus] = useState<TerminalStatus>({ state: 'starting' })
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const resumeRef = useRef(resumeSessionId)
  const initialPromptRef = useRef(initialPrompt)
  const terminalRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(XTERM_OPTIONS)
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    loadWebgl(terminal)
    terminalRef.current = terminal

    let terminalId: string | null = null
    let isDisposed = false
    const cleanups: Array<() => void> = []

    const connect = (id: string) => {
      terminalId = id
      setConnectedId(id)
      setStatus({ state: 'running' })
      // The pane may have resized while the PTY was starting; sync before listening.
      dugout.terminal.resize(id, terminal.cols, terminal.rows)
      const input = terminal.onData((data) => dugout.terminal.write(id, data))
      const resize = terminal.onResize(({ cols, rows }) => dugout.terminal.resize(id, cols, rows))
      cleanups.push(
        dugout.terminal.onData((sourceId, data) => sourceId === id && terminal.write(data)),
        dugout.terminal.onExit((sourceId, exit) => {
          if (sourceId === id) setStatus({ state: 'exited', exit })
        }),
        dugout.terminal.onAgentStatus((sourceId, next) => {
          if (sourceId === id) setAgentStatus(next)
        }),
        dugout.terminal.onAgentSession((sourceId, next) => {
          if (sourceId === id) setSessionId(next)
        }),
        () => input.dispose(),
        () => resize.dispose(),
      )
    }

    const start = () => {
      dugout.terminal
        .create({
          kind,
          projectId,
          cwd,
          cols: terminal.cols,
          rows: terminal.rows,
          ...(resumeRef.current && { resumeSessionId: resumeRef.current }),
          ...(initialPromptRef.current && { initialPrompt: initialPromptRef.current }),
        })
        .then((result) => {
          if (!result.ok) {
            if (!isDisposed) setStatus({ state: 'error', message: result.error })
            return
          }
          if (isDisposed) dugout.terminal.kill(result.data)
          else connect(result.data)
        })
        .catch((error: unknown) => {
          console.error('[terminal] create failed', error)
          if (!isDisposed) setStatus({ state: 'error', message: 'Could not start terminal.' })
        })
    }

    // Start the process only once the pane has a real size, so it never begins tiny.
    let hasStarted = false
    const observer = new ResizeObserver(() => {
      if (!hasUsableSize(container)) return
      fit.fit()
      if (!hasStarted) {
        hasStarted = true
        start()
      }
    })
    observer.observe(container)

    return () => {
      isDisposed = true
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      if (terminalId) dugout.terminal.kill(terminalId)
      terminalRef.current = null
      terminal.dispose()
    }
  }, [containerRef, kind, projectId, cwd])

  const focus = useCallback(() => terminalRef.current?.focus(), [])
  return { status, agentStatus, terminalId: connectedId, sessionId, focus }
}
