import type { AgentStatus } from '@shared/agentStatus'
import type { ProjectId } from '@shared/project'
import type { TerminalId } from '@shared/terminal'

export interface AgentStatusChange {
  readonly terminalId: TerminalId
  readonly projectId: ProjectId
  /** Null once the terminal has exited. */
  readonly status: AgentStatus | null
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

const MESSAGES: Partial<Record<AgentStatus, string>> = {
  'needs-input': 'Claude needs your input.',
  done: 'Claude finished and is ready for review.',
}

const FALLBACK_TITLE = 'Dugout'

/** Native notifications for agents that need the user while Dugout is in the background. */
export class AgentNotifier {
  constructor(private readonly deps: AgentNotifierDeps) {}

  handle(change: AgentStatusChange): void {
    const body = change.status ? MESSAGES[change.status] : undefined
    if (!body || this.deps.isAppFocused()) return

    const title = this.deps.projectName(change.projectId) ?? FALLBACK_TITLE
    try {
      this.deps.show({ terminalId: change.terminalId, title, body })
    } catch (error) {
      console.error('[notifications] could not show notification:', error)
    }
  }
}
