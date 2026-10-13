/** Test helpers for the IPC adapters: a fake `ipcMain`, a sender, and project/worktree fakes. */
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'
import { vi } from 'vitest'
import type { Project } from '@shared/project'
import type { Result } from '@shared/result'
import type { ProjectStore } from '../services/projects/ProjectStore'
import type { WorktreeManager } from '../services/worktrees/WorktreeManager'
import type { IpcMainLike } from './handle'

type InvokeListener = (event: IpcMainInvokeEvent, payload: unknown) => unknown
type EventListener = (event: IpcMainEvent) => void

/** The renderer `WebContents` a request came from; records what main sends back to it. */
export interface FakeSender {
  readonly id: number
  readonly sent: { channel: string; payload: unknown }[]
  destroyed: boolean
  isDestroyed(): boolean
  send(channel: string, payload: unknown): void
}

export function fakeSender(id = 1): FakeSender {
  const sender: FakeSender = {
    id,
    sent: [],
    destroyed: false,
    isDestroyed: () => sender.destroyed,
    send: (channel, payload) => {
      sender.sent.push({ channel, payload })
    },
  }
  return sender
}

/** Records registered handlers and lets a test call them the way the renderer would. */
export class FakeIpcMain implements IpcMainLike {
  private readonly handlers = new Map<string, InvokeListener>()
  private readonly listeners = new Map<string, EventListener>()

  handle(channel: string, listener: InvokeListener): void {
    // Electron throws on a second handler for a channel; so does the fake.
    if (this.handlers.has(channel)) throw new Error(`Second handler for "${channel}"`)
    this.handlers.set(channel, listener)
  }

  on(channel: string, listener: EventListener): this {
    this.listeners.set(channel, listener)
    return this
  }

  /** Every channel with a handler or listener, sorted. */
  channels(): string[] {
    return [...this.handlers.keys(), ...this.listeners.keys()].sort()
  }

  async invoke<T = unknown>(
    channel: string,
    payload?: unknown,
    sender: FakeSender = fakeSender(),
  ): Promise<Result<T>> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler for "${channel}"`)
    return (await handler({ sender } as unknown as IpcMainInvokeEvent, payload)) as Result<T>
  }

  /** The raw value a plain `ipcMain.handle` handler resolves to (no `Result` envelope). */
  async invokeRaw(channel: string, payload?: unknown, sender = fakeSender()): Promise<unknown> {
    const handler = this.handlers.get(channel)
    if (!handler) throw new Error(`No handler for "${channel}"`)
    return handler({ sender } as unknown as IpcMainInvokeEvent, payload)
  }

  emit(channel: string, sender: FakeSender = fakeSender()): void {
    const listener = this.listeners.get(channel)
    if (!listener) throw new Error(`No listener for "${channel}"`)
    listener({ sender } as unknown as IpcMainEvent)
  }
}

export const PROJECT_ID = 'p1'
export const PROJECT_ROOT = '/repos/demo'
export const MANAGED_WORKTREE = '/worktrees/p1/feature'
export const UNMANAGED_FOLDER = '/somewhere/else'

export function testProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    name: 'demo',
    rootPath: PROJECT_ROOT,
    color: 'blue',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** A ProjectStore with only `list`, for handlers that look a project up by id. */
export function fakeProjects(projects: readonly Project[] = [testProject()]): ProjectStore {
  return { list: () => projects } as unknown as ProjectStore
}

/**
 * A WorktreeManager whose `resolveCheckout` behaves like the real one: the project root when no
 * worktree is named, the worktree when it is managed, and an error otherwise.
 */
export function fakeWorktrees(
  managed: readonly string[] = [MANAGED_WORKTREE],
  extra: Partial<Record<keyof WorktreeManager, unknown>> = {},
) {
  const resolveCheckout = vi.fn(async (project: Project, worktreePath: string | undefined) => {
    if (worktreePath === undefined) return project.rootPath
    if (!managed.includes(worktreePath)) {
      throw new Error('That folder is not a worktree of this project.')
    }
    return worktreePath
  })
  const manager = { resolveCheckout, ...extra } as unknown as WorktreeManager
  return { manager, resolveCheckout }
}

/** Keeps the expected "[ipc] rejected …" / "[ipc] … failed" logs out of the test output. */
export function silenceIpcLogs() {
  return {
    warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
    error: vi.spyOn(console, 'error').mockImplementation(() => {}),
  }
}
