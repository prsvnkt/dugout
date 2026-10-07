import type { AgentKind } from './terminal'

/** App preferences the renderer reads and changes. */
export interface AppSettings {
  /** The agent the start screen's prompt box sends work to. */
  readonly defaultAgent: AgentKind
}

export const DEFAULT_AGENT: AgentKind = 'claude'
