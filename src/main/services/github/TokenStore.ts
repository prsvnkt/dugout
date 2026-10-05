import { readFile, rm } from 'node:fs/promises'
import { writeFileAtomic } from '../projects/atomicWrite'

/** Electron's safeStorage (macOS Keychain-backed), injected so tests can fake it. */
export interface Encryption {
  isAvailable(): boolean
  encrypt(text: string): Buffer
  decrypt(data: Buffer): string
}

export interface TokenStoreDeps {
  readonly filePath: string
  readonly encryption: Encryption
}

const OWNER_ONLY = 0o600

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
}

/** Keeps the GitHub token encrypted on disk. It never leaves the main process. */
export class TokenStore {
  constructor(private readonly deps: TokenStoreDeps) {}

  async load(): Promise<string | null> {
    try {
      const data = await readFile(this.deps.filePath)
      return this.deps.encryption.decrypt(data)
    } catch (error) {
      if (isMissing(error)) return null
      console.warn('[github] could not read the stored token; signing out:', error)
      await this.clear()
      return null
    }
  }

  async save(token: string): Promise<void> {
    if (!this.deps.encryption.isAvailable()) {
      throw new Error('Secure storage is not available, so the GitHub token cannot be saved.')
    }
    const encrypted = this.deps.encryption.encrypt(token)
    await writeFileAtomic(this.deps.filePath, encrypted.toString('latin1'), OWNER_ONLY, 'latin1')
  }

  async clear(): Promise<void> {
    await rm(this.deps.filePath, { force: true })
  }
}
