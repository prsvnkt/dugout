import { create } from 'zustand'
import type { LinearState, LinearTeam } from '@shared/linear'
import { unwrap } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'

interface LinearStoreState {
  /** Null until loaded. */
  readonly state: LinearState | null
  readonly teams: readonly LinearTeam[] | null
  load(): Promise<void>
  /** Each action throws with a user-facing message, for the calling form to show. */
  connect(apiKey: string): Promise<void>
  disconnect(): Promise<void>
  loadTeams(): Promise<void>
}

/** The Linear connection, as the renderer may see it: the account name, never the key. */
export const useLinearStore = create<LinearStoreState>()((set) => ({
  state: null,
  teams: null,

  async load() {
    const result = await dugout.linear.getState()
    if (result.ok) set({ state: result.data })
    else console.warn('[linear] could not read the connection:', result.error)
  },

  async connect(apiKey) {
    set({ state: unwrap(await dugout.linear.connect(apiKey)), teams: null })
  },

  async disconnect() {
    set({ state: unwrap(await dugout.linear.disconnect()), teams: null })
  },

  async loadTeams() {
    set({ teams: unwrap(await dugout.linear.listTeams()) })
  },
}))

export function isLinearConnected(state: LinearState | null): boolean {
  return state?.status === 'connected'
}
