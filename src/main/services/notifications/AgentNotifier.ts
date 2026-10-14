import { AGENTS, type AgentKind } from '@shared/agents'
import type { AgentStatus } from '@shared/agentStatus'
import type { ProjectId } from '@shared/project'
import type { TerminalId } from '@shared/terminal'

export interface AgentStatusChange {
  readonly terminalId: TerminalId
  readonly projectId: ProjectId
  /** Which agent it is, so the fallback text names it. */
  readonly agentKind: AgentKind
  /** Null once the terminal has exited. */
  readonly status: AgentStatus | null
  /** Why it is waiting or what it finished, when the hook said. */
  readonly detail?: string | undefined
}

export interface AgentNotification {
  readonly terminalId: TerminalId
  readonly title: string
  readonly body: string
}

export interface AgentNotifierDeps {
  readonly isAppFocused: () => boolean
  readonly projectName: (projectId: ProjectId) => string | undefined
  readonly show: (notification: AgentNotification) => void
}

/** What the notification says when the hook sent no detail, in the agent's own name. */
const MESSAGES: Partial<Record<AgentStatus, (label: string) => string>> = {
  'needs-input': (label) => `${label} needs your input.`,
  done: (label) => `${label} finished and is ready for review.`,
}

const FALLBACK_TITLE = 'Dugout'

/** Native notifications for agents that need the user while Dugout is in the background. */
export class AgentNotifier {
  constructor(private readonly deps: AgentNotifierDeps) {}

  handle(change: AgentStatusChange): void {
    const message = change.status ? MESSAGES[change.status] : undefined
    if (!message || this.deps.isAppFocused()) return
    const body = change.detail ?? message(AGENTS[change.agentKind].label)

    const title = this.deps.projectName(change.projectId) ?? FALLBACK_TITLE
    try {
      this.deps.show({ terminalId: change.terminalId, title, body })
    } catch (error) {
      console.error('[notifications] could not show notification:', error)
    }
  }
}
