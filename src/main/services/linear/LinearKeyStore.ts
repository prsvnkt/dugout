import { readFile, rm } from 'node:fs/promises'
import type { LinearAccount } from '@shared/linear'
import type { Encryption } from '../github/TokenStore'
import { writeFileAtomic } from '../projects/atomicWrite'

/** The saved connection: the key, and the account it belongs to (shown without a request). */
export interface StoredLinearKey {
  readonly apiKey: string
  readonly account: LinearAccount
}

export interface LinearKeyStoreDeps {
  readonly filePath: string
  readonly encryption: Encryption
}

const OWNER_ONLY = 0o600

function isStoredKey(value: unknown): value is StoredLinearKey {
  const candidate = value as Partial<StoredLinearKey> | null
  return (
    typeof candidate?.apiKey === 'string' &&
    typeof candidate.account?.name === 'string' &&
    typeof candidate.account.organization === 'string'
  )
}

/**
 * Keeps the Linear API key encrypted on disk with the same `safeStorage` encryption as the
 * GitHub token (decision 015). It never leaves the main process.
 */
export class LinearKeyStore {
  constructor(private readonly deps: LinearKeyStoreDeps) {}

  async load(): Promise<StoredLinearKey | null> {
    let data: Buffer
    try {
      data = await readFile(this.deps.filePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw error
    }
    try {
      const parsed: unknown = JSON.parse(this.deps.encryption.decrypt(data))
      if (isStoredKey(parsed)) return parsed
    } catch {
      // Unreadable (e.g. encrypted on another machine): fall through and forget it.
    }
    console.warn('[linear] could not read the stored API key; disconnecting')
    await this.clear()
    return null
  }

  async save(stored: StoredLinearKey): Promise<void> {
    if (!this.deps.encryption.isAvailable()) {
      throw new Error('Secure storage is not available, so the Linear API key cannot be saved.')
    }
    const encrypted = this.deps.encryption.encrypt(JSON.stringify(stored))
    await writeFileAtomic(this.deps.filePath, encrypted.toString('latin1'), OWNER_ONLY, 'latin1')
  }

  async clear(): Promise<void> {
    await rm(this.deps.filePath, { force: true })
  }
}
