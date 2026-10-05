import type { TerminalCreateRequest } from './ipc/contract'
import type { TerminalExit, TerminalId } from './terminal'

export type Unsubscribe = () => void

/** The API the preload script exposes to the renderer as `window.dugout`. */
export interface DugoutApi {
  readonly terminal: {
    create(request: TerminalCreateRequest): Promise<TerminalId>
    write(id: TerminalId, data: string): void
    resize(id: TerminalId, cols: number, rows: number): void
    kill(id: TerminalId): void
    onData(listener: (id: TerminalId, data: string) => void): Unsubscribe
    onExit(listener: (id: TerminalId, exit: TerminalExit) => void): Unsubscribe
  }
  readonly dialog: {
    /** Resolves to the chosen absolute folder path, or null if cancelled. */
    pickFolder(): Promise<string | null>
  }
}
