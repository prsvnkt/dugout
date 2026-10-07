import { create } from 'zustand'
import { DEFAULT_AGENT } from '@shared/settings'
import type { AgentKind } from '@shared/terminal'
import { dugout } from '@renderer/lib/dugout'

interface DefaultAgentState {
  /** The agent the start screen's prompt box sends work to. */
  readonly defaultAgent: AgentKind
  readonly isLoaded: boolean
  load(): Promise<void>
  /** Saves the choice; if saving fails the previous agent stays selected. */
  setDefaultAgent(agent: AgentKind): Promise<void>
}

export const useDefaultAgentStore = create<DefaultAgentState>()((set, get) => ({
  defaultAgent: DEFAULT_AGENT,
  isLoaded: false,

  async load() {
    if (get().isLoaded) return
    const result = await dugout.settings.get()
    // A choice made while loading wins over the saved value.
    if (get().isLoaded) return
    if (result.ok) set({ defaultAgent: result.data.defaultAgent, isLoaded: true })
    else console.error('[settings] could not load the default agent:', result.error)
  },

  async setDefaultAgent(agent) {
    const previous = get().defaultAgent
    if (agent === previous) return
    set({ defaultAgent: agent, isLoaded: true })
    const result = await dugout.settings.update({ defaultAgent: agent })
    if (result.ok) return
    console.error('[settings] could not save the default agent:', result.error)
    set({ defaultAgent: previous })
  },
}))
