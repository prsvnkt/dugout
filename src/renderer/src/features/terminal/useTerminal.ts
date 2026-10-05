import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
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
  focus(): void
}

const FALLBACK_SIZE = { cols: 100, rows: 30 }

function loadWebgl(terminal: Terminal): void {
  try {
    const webgl = new WebglAddon()
    webgl.onContextLoss(() => webgl.dispose())
    terminal.loadAddon(webgl)
  } catch (error) {
    console.warn('[terminal] WebGL renderer unavailable, using DOM renderer', error)
  }
}

/** Hidden containers measure 0×0; fitting then would shrink the PTY to 2 columns. */
function fitIfVisible(container: HTMLElement, fit: FitAddon): void {
  if (container.clientWidth > 0 && container.clientHeight > 0) fit.fit()
}

/** Mounts an xterm into `containerRef` and connects it to a new PTY in the main process. */
export function useTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  kind: TerminalKind,
  cwd: string,
): TerminalHandle {
  const [status, setStatus] = useState<TerminalStatus>({ state: 'starting' })
  const terminalRef = useRef<Terminal | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(XTERM_OPTIONS)
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    loadWebgl(terminal)
    fitIfVisible(container, fit)
    terminalRef.current = terminal

    let terminalId: string | null = null
    let isDisposed = false
    const cleanups: Array<() => void> = []

    const connect = (id: string) => {
      terminalId = id
      setStatus({ state: 'running' })
      const input = terminal.onData((data) => dugout.terminal.write(id, data))
      const resize = terminal.onResize(({ cols, rows }) => dugout.terminal.resize(id, cols, rows))
      cleanups.push(
        dugout.terminal.onData((sourceId, data) => sourceId === id && terminal.write(data)),
        dugout.terminal.onExit((sourceId, exit) => {
          if (sourceId === id) setStatus({ state: 'exited', exit })
        }),
        () => input.dispose(),
        () => resize.dispose(),
      )
    }

    const size = fit.proposeDimensions() ?? FALLBACK_SIZE
    dugout.terminal
      .create({ kind, cwd, cols: size.cols, rows: size.rows })
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

    const observer = new ResizeObserver(() => fitIfVisible(container, fit))
    observer.observe(container)

    return () => {
      isDisposed = true
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      if (terminalId) dugout.terminal.kill(terminalId)
      terminalRef.current = null
      terminal.dispose()
    }
  }, [containerRef, kind, cwd])

  const focus = useCallback(() => terminalRef.current?.focus(), [])
  return { status, focus }
}
