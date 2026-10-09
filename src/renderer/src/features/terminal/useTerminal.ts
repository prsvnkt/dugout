import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import type { AgentStatus } from '@shared/agentStatus'
import type { DevServer } from '@shared/preview'
import type { ToolCallPreview } from '@shared/toolCall'
import type { AgentUsage } from '@shared/usage'
import type { TerminalCreateRequest } from '@shared/ipc/contract'
import { dugout } from '@renderer/lib/dugout'
import {
  isAgentKind,
  type TerminalExit,
  type TerminalId,
  type TerminalKind,
} from '@shared/terminal'
import { XTERM_OPTIONS } from './xtermOptions'
import { agentKeyOverride } from './agentKeys'
import { registerPaste } from './terminalInput'
import { createFlowControl } from './flowControl'
import { createOutputRouter } from './outputRouter'
import { createFrameCoalescer, createTrailingDebounce, RESIZE_SETTLE_MS } from './resizeScheduling'
import { createWebglToggle, type LoadWebgl, type WebglToggle } from './webglToggle'
import { useCheckStore } from '@renderer/features/checks/checkStore'
import {
  applySubagentUpdate,
  clearFinished,
  startsNewTurn,
  type Subagent,
} from '@renderer/features/agents/subagents'

const NO_SUBAGENTS: readonly Subagent[] = []
const NO_APPROVALS: readonly ToolCallPreview[] = []

export type TerminalStatus =
  | { readonly state: 'starting' }
  | { readonly state: 'running' }
  | { readonly state: 'exited'; readonly exit: TerminalExit }
  | { readonly state: 'error'; readonly message: string }

export interface TerminalHandle {
  readonly status: TerminalStatus
  /** Claude terminals only; null for shells or before the first hook fires. */
  readonly agentStatus: AgentStatus | null
  /** Why the agent is waiting or what it finished (from its hooks), if known. */
  readonly agentDetail: string | null
  /** Tool calls the agent waits to have approved, oldest first. */
  readonly agentApprovals: readonly ToolCallPreview[]
  /** The main-process terminal id, once the PTY has started. */
  readonly terminalId: string | null
  /** The Claude session id reported by hooks (Claude terminals only). */
  readonly sessionId: string | null
  /** Subagents the agent started this turn (finished ones clear on its next turn). */
  readonly subagents: readonly Subagent[]
  /** Tokens of the agent's session so far (agents with `hasUsage`); null until reported. */
  readonly usage: AgentUsage | null
  focus(): void
}

/** Loads xterm's WebGL renderer, or keeps the DOM renderer when WebGL is unavailable. */
function webglLoader(terminal: Terminal): LoadWebgl {
  return (onContextLost) => {
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        console.warn('[terminal] WebGL context lost, using DOM renderer')
        onContextLost()
      })
      terminal.loadAddon(webgl)
      return webgl
    } catch (error) {
      console.warn('[terminal] WebGL renderer unavailable, using DOM renderer', error)
      return null
    }
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
  /** Shells only: started with `PORT` set, then this command typed once. Read once at start. */
  readonly devServer?: DevServer | undefined
  /** The task an agent works on; its usage counts towards it. Read once at start. */
  readonly taskNumber?: number | undefined
  /** False while the pane's project is hidden: it then gives up its WebGL context. */
  readonly isVisible: boolean
}

interface TerminalEventSetters {
  setStatus(status: TerminalStatus): void
  setAgentStatus(status: AgentStatus): void
  setAgentDetail(detail: string | null): void
  setAgentApprovals(approvals: readonly ToolCallPreview[]): void
  setSessionId(sessionId: string): void
  setSubagents(update: (list: readonly Subagent[]) => readonly Subagent[]): void
  setUsage(usage: AgentUsage): void
}

/** Subscribes to the PTY's exit and its agent's hook events; returns the unsubscribers. */
function listenToTerminal(id: TerminalId, set: TerminalEventSetters): Array<() => void> {
  let lastAgentStatus: AgentStatus | null = null
  return [
    dugout.terminal.onExit((sourceId, exit) => {
      if (sourceId !== id) return
      set.setStatus({ state: 'exited', exit })
      set.setSubagents(() => NO_SUBAGENTS)
      useCheckStore.getState().remove(id)
    }),
    dugout.terminal.onAgentStatus((sourceId, next, detail, approvals) => {
      if (sourceId !== id) return
      if (startsNewTurn(lastAgentStatus, next)) set.setSubagents(clearFinished)
      lastAgentStatus = next
      set.setAgentStatus(next)
      set.setAgentDetail(detail ?? null)
      set.setAgentApprovals(approvals.length > 0 ? approvals : NO_APPROVALS)
    }),
    dugout.terminal.onAgentSubagent((sourceId, update) => {
      if (sourceId === id) set.setSubagents((list) => applySubagentUpdate(list, update))
    }),
    dugout.terminal.onAgentSession((sourceId, next) => {
      if (sourceId === id) set.setSessionId(next)
    }),
    dugout.terminal.onCheckStatus((sourceId, check) => {
      if (sourceId === id) useCheckStore.getState().set(id, check)
    }),
    () => useCheckStore.getState().remove(id),
    dugout.terminal.onAgentUsage((sourceId, next) => {
      if (sourceId === id) set.setUsage(next)
    }),
  ]
}

/** Wires keyboard input, pastes and debounced resizes to the PTY `id`. */
function wireInput(terminal: Terminal, id: TerminalId, kind: TerminalKind): Array<() => void> {
  const input = terminal.onData((data) => dugout.terminal.write(id, data))
  if (isAgentKind(kind)) {
    terminal.attachCustomKeyEventHandler((event) => {
      const override = agentKeyOverride(event)
      if (override === null) return true
      // Also blocks the keypress, or xterm would send `\r` from it and submit anyway.
      event.preventDefault()
      dugout.terminal.write(id, override)
      return false
    })
  }
  // One SIGWINCH once a splitter drag settles, not one per frame (decision 052).
  const sendResize = createTrailingDebounce(
    (cols: number, rows: number) => dugout.terminal.resize(id, cols, rows),
    RESIZE_SETTLE_MS,
  )
  const resize = terminal.onResize(({ cols, rows }) => sendResize.call(cols, rows))
  return [
    registerPaste(id, (text) => terminal.paste(text)),
    () => input.dispose(),
    () => resize.dispose(),
    () => sendResize.dispose(),
  ]
}

/** Writes output to xterm, pausing the PTY while xterm is far behind (decision 052). */
function flowControlled(terminal: Terminal, id: TerminalId) {
  return createFlowControl({
    write: (data, done) => terminal.write(data, done),
    pause: () => dugout.terminal.pause(id),
    resume: () => dugout.terminal.resume(id),
  })
}

/**
 * Fits `terminal` to `container` whenever it resizes, at most once per frame. The first usable
 * measurement fits at once and calls `onFirstFit`: frames do not run while the window is
 * minimised, and a task queued in the background must still start.
 */
function observeSize(container: HTMLElement, fit: FitAddon, onFirstFit: () => void): () => void {
  const refit = createFrameCoalescer(() => {
    if (hasUsableSize(container)) fit.fit()
  })
  let hasFitted = false
  const observer = new ResizeObserver(() => {
    if (!hasUsableSize(container)) return
    if (hasFitted) {
      refit.schedule()
      return
    }
    fit.fit()
    hasFitted = true
    onFirstFit()
  })
  observer.observe(container)
  return () => {
    observer.disconnect()
    refit.dispose()
  }
}

/** What a pane starts its PTY with; read once, when it first has a size. */
interface StartOptions {
  readonly resumeSessionId?: string | undefined
  readonly initialPrompt?: string | undefined
  readonly devServer?: DevServer | undefined
  readonly taskNumber?: number | undefined
}

interface PtyStart {
  readonly request: TerminalCreateRequest
  readonly devServer: DevServer | undefined
  isDisposed(): boolean
  onConnect(id: TerminalId): void
  onError(message: string): void
}

function createRequest(
  base: Pick<TerminalCreateRequest, 'kind' | 'projectId' | 'cwd' | 'cols' | 'rows'>,
  { resumeSessionId, initialPrompt, devServer, taskNumber }: StartOptions,
): TerminalCreateRequest {
  return {
    ...base,
    ...(resumeSessionId && { resumeSessionId }),
    ...(initialPrompt && { initialPrompt }),
    ...(devServer && { port: devServer.port }),
    ...(taskNumber !== undefined && { taskNumber }),
  }
}

/** Starts the PTY; kills it if the pane unmounted while it was starting (StrictMode). */
function startPty({ request, devServer, isDisposed, onConnect, onError }: PtyStart): void {
  dugout.terminal
    .create(request)
    .then((result) => {
      if (!result.ok) {
        if (!isDisposed()) onError(result.error)
        return
      }
      if (isDisposed()) {
        dugout.terminal.kill(result.data)
        return
      }
      onConnect(result.data)
      // Typed like the user would, so the shell stays open and ↑ runs it again.
      if (devServer) dugout.terminal.write(result.data, `${devServer.command}\r`)
    })
    .catch((error: unknown) => {
      console.error('[terminal] create failed', error)
      if (!isDisposed()) onError('Could not start terminal.')
    })
}

export function useTerminal(
  containerRef: RefObject<HTMLDivElement | null>,
  options: TerminalOptions,
): TerminalHandle {
  const { kind, projectId, cwd, resumeSessionId, initialPrompt, devServer, taskNumber } = options
  const { isVisible } = options
  const [status, setStatus] = useState<TerminalStatus>({ state: 'starting' })
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null)
  const [agentDetail, setAgentDetail] = useState<string | null>(null)
  const [agentApprovals, setAgentApprovals] = useState<readonly ToolCallPreview[]>(NO_APPROVALS)
  const [connectedId, setConnectedId] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [subagents, setSubagents] = useState<readonly Subagent[]>(NO_SUBAGENTS)
  const [usage, setUsage] = useState<AgentUsage | null>(null)
  const startRef = useRef<StartOptions>({ resumeSessionId, initialPrompt, devServer, taskNumber })
  const isVisibleRef = useRef(isVisible)
  const terminalRef = useRef<Terminal | null>(null)
  const webglRef = useRef<WebglToggle | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const terminal = new Terminal(XTERM_OPTIONS)
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(container)
    const webgl = createWebglToggle(webglLoader(terminal))
    webgl.setEnabled(isVisibleRef.current)
    webglRef.current = webgl
    terminalRef.current = terminal

    let terminalId: string | null = null
    let isDisposed = false
    // Listening before `create()` keeps any output that arrives before its reply.
    const output = createOutputRouter()
    const cleanups: Array<() => void> = [
      dugout.terminal.onData((sourceId, data) => output.receive(sourceId, data)),
      () => output.dispose(),
    ]
    const setters: TerminalEventSetters = {
      setStatus,
      setAgentStatus,
      setAgentDetail,
      setAgentApprovals,
      setSessionId,
      setSubagents,
      setUsage,
    }

    const connect = (id: string) => {
      terminalId = id
      setConnectedId(id)
      setStatus({ state: 'running' })
      // The pane may have resized while the PTY was starting; sync before listening.
      dugout.terminal.resize(id, terminal.cols, terminal.rows)
      const flow = flowControlled(terminal, id)
      output.connect(id, (data) => flow.write(data))
      cleanups.push(
        () => flow.dispose(),
        ...wireInput(terminal, id, kind),
        ...listenToTerminal(id, setters),
      )
    }

    const start = () =>
      startPty({
        request: createRequest(
          { kind, projectId, cwd, cols: terminal.cols, rows: terminal.rows },
          startRef.current,
        ),
        devServer: startRef.current.devServer,
        isDisposed: () => isDisposed,
        onConnect: connect,
        onError: (message) => setStatus({ state: 'error', message }),
      })

    // Start the process only once the pane has a real size, so it never begins tiny.
    const stopObserving = observeSize(container, fit, start)

    return () => {
      isDisposed = true
      stopObserving()
      cleanups.forEach((cleanup) => cleanup())
      if (terminalId) dugout.terminal.kill(terminalId)
      terminalRef.current = null
      webglRef.current = null
      webgl.dispose()
      terminal.dispose()
    }
  }, [containerRef, kind, projectId, cwd])

  // Only panes of the visible project hold a WebGL context (decision 052).
  useEffect(() => {
    isVisibleRef.current = isVisible
    webglRef.current?.setEnabled(isVisible)
  }, [isVisible])

  const focus = useCallback(() => terminalRef.current?.focus(), [])
  return {
    status,
    agentStatus,
    agentDetail,
    agentApprovals,
    terminalId: connectedId,
    sessionId,
    subagents,
    usage,
    focus,
  }
}
