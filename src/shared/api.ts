import type { AppCommand } from './commands'
import type { ProjectAddRequest, ProjectUpdateRequest, TerminalCreateRequest } from './ipc/contract'
import type { Project, ProjectId } from './project'
import type { Result } from './result'
import type { TerminalExit, TerminalId } from './terminal'

export type Unsubscribe = () => void

/** The API the preload script exposes to the renderer as `window.dugout`. */
export interface DugoutApi {
  readonly terminal: {
    create(request: TerminalCreateRequest): Promise<Result<TerminalId>>
    write(id: TerminalId, data: string): void
    resize(id: TerminalId, cols: number, rows: number): void
    kill(id: TerminalId): void
    onData(listener: (id: TerminalId, data: string) => void): Unsubscribe
    onExit(listener: (id: TerminalId, exit: TerminalExit) => void): Unsubscribe
  }
  readonly projects: {
    list(): Promise<Result<readonly Project[]>>
    add(request: ProjectAddRequest): Promise<Result<Project>>
    update(request: ProjectUpdateRequest): Promise<Result<Project>>
    remove(id: ProjectId): Promise<Result<void>>
  }
  readonly dialog: {
    /** Resolves to the chosen absolute folder path, or null if cancelled. */
    pickFolder(): Promise<string | null>
  }
  /** Commands from the native menu and its keyboard shortcuts. */
  onCommand(listener: (command: AppCommand) => void): Unsubscribe
}
