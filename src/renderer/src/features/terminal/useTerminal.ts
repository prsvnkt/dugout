import { useEffect, useState, type RefObject } from 'react'
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

/** Mounts an xterm into `containerRef` and connects it to a new PTY in the main process. */
export function useTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  kind: TerminalKind,
  cwd: string,
): TerminalStatus {
  const [status, setStatus] = useState<TerminalStatus>({ state: 'starting' })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(XTERM_OPTIONS)
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    loadWebgl(terminal)
    fit.fit()

    let terminalId: string | null = null
    let isDisposed = false
    const cleanups: Array<() => void> = []

    const connect = (id: string) => {
      terminalId = id
      setStatus({ state: 'running' })
      cleanups.push(
        dugout.terminal.onData((sourceId, data) => sourceId === id && terminal.write(data)),
        dugout.terminal.onExit((sourceId, exit) => {
          if (sourceId === id) setStatus({ state: 'exited', exit })
        }),
      )
      const input = terminal.onData((data) => dugout.terminal.write(id, data))
      const resize = terminal.onResize(({ cols, rows }) => dugout.terminal.resize(id, cols, rows))
      cleanups.push(
        () => input.dispose(),
        () => resize.dispose(),
      )
      terminal.focus()
    }

    const size = fit.proposeDimensions() ?? FALLBACK_SIZE
    dugout.terminal
      .create({ kind, cwd, cols: size.cols, rows: size.rows })
      .then((id) => (isDisposed ? dugout.terminal.kill(id) : connect(id)))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error)
        if (!isDisposed) setStatus({ state: 'error', message })
      })

    const observer = new ResizeObserver(() => fit.fit())
    observer.observe(container)

    return () => {
      isDisposed = true
      observer.disconnect()
      cleanups.forEach((cleanup) => cleanup())
      if (terminalId) dugout.terminal.kill(terminalId)
      terminal.dispose()
    }
  }, [containerRef, kind, cwd])

  return status
}
