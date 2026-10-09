import type { LinearAccount, LinearState } from '@shared/linear'
import type { StoredLinearKey } from './LinearKeyStore'

export interface LinearAuthDeps {
  readonly store: {
    load(): Promise<StoredLinearKey | null>
    save(stored: StoredLinearKey): Promise<void>
    clear(): Promise<void>
  }
  /** Asks Linear who the key belongs to; rejects when Linear does not accept it. */
  readonly viewer: (apiKey: string) => Promise<LinearAccount>
}

export const LINEAR_NOT_CONNECTED =
  'This project’s tasks are in Linear. Connect Linear in the Tasks panel with a personal API key.'

/** The user's Linear connection: one personal API key, kept in main. */
export class LinearAuth {
  private loaded: Promise<StoredLinearKey | null> | null = null

  constructor(private readonly deps: LinearAuthDeps) {}

  async state(): Promise<LinearState> {
    const stored = await this.stored()
    return stored ? { status: 'connected', account: stored.account } : { status: 'disconnected' }
  }

  /** Checks the key with Linear before saving it, so a typo never replaces a working key. */
  async connect(apiKey: string): Promise<LinearState> {
    const account = await this.deps.viewer(apiKey)
    const stored = { apiKey, account }
    await this.deps.store.save(stored)
    this.loaded = Promise.resolve(stored)
    return { status: 'connected', account }
  }

  async disconnect(): Promise<LinearState> {
    await this.deps.store.clear()
    this.loaded = Promise.resolve(null)
    return { status: 'disconnected' }
  }

  async withKey<T>(call: (apiKey: string) => Promise<T>): Promise<T> {
    const stored = await this.stored()
    if (!stored) throw new Error(LINEAR_NOT_CONNECTED)
    return call(stored.apiKey)
  }

  private stored(): Promise<StoredLinearKey | null> {
    // A failed read is not remembered, so the next call tries again.
    this.loaded ??= this.deps.store.load().catch((error: unknown) => {
      this.loaded = null
      throw error
    })
    return this.loaded
  }
}
