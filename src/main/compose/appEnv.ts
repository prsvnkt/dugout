import { BrowserWindow, safeStorage, shell } from 'electron'
import type { AppCommand } from '@shared/commands'
import { IpcChannel } from '@shared/ipc/channels'
import type { DevOverrides } from '../devOverrides'
import type { agentCommands } from '../services/agents/registry'
import type { Encryption } from '../services/github/TokenStore'
import type { ProjectStore } from '../services/projects/ProjectStore'

/** What every compose step reads: where data lives, the overrides, and how to reach windows. */
export interface AppEnv {
  /** Electron's userData folder (or the override / "Dugout Dev"). */
  readonly dataDir: string
  /** The real home folder, or DUGOUT_HOME_DIR in tests. */
  readonly homeDir: string
  readonly overrides: DevOverrides
  readonly commands: ReturnType<typeof agentCommands>
  readonly encryption: Encryption
}

/**
 * safeStorage is Keychain-backed on macOS. E2E tests opt into a plaintext stand-in so they never
 * trigger Keychain prompts; the override's name makes the trade-off explicit.
 */
export function tokenEncryption(insecureTokenStorage: boolean): Encryption {
  if (insecureTokenStorage) {
    return {
      isAvailable: () => true,
      encrypt: (text) => Buffer.from(text, 'utf8'),
      decrypt: (data) => data.toString('utf8'),
    }
  }
  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (data) => safeStorage.decryptString(data),
  }
}

export function broadcast(channel: string, ...args: unknown[]): void {
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send(channel, ...args)
}

/** Sends a menu or notification command to the focused window (else the first one). */
export function sendCommand(command: AppCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannel.appCommand, command)
}

export function openExternal(url: string): Promise<void> {
  return shell.openExternal(url)
}

/** The saved project with this id, if any. */
export function findProject(projects: ProjectStore, id: string) {
  return projects.list().find((project) => project.id === id)
}

/** A cancellable timer, as services that retry or time out take it. */
export function schedule(run: () => void, delayMs: number): () => void {
  const timer = setTimeout(run, delayMs)
  return () => clearTimeout(timer)
}
