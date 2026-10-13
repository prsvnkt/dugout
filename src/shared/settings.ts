import type { AgentKind } from './agents'

/** App preferences the renderer reads and changes. */
export interface AppSettings {
  /** The agent the start screen's prompt box sends work to. */
  readonly defaultAgent: AgentKind
}
