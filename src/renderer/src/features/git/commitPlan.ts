export interface CommitPlanInput {
  readonly stagedCount: number
  readonly unstagedCount: number
  readonly message: string
}

export interface CommitPlan {
  readonly canCommit: boolean
  /** Stage every change first: with nothing staged, Commit commits everything (VS Code). */
  readonly includeAll: boolean
  /** Button text. */
  readonly label: string
  /** Accessible name and tooltip, spelling out what will be committed. */
  readonly description: string
}

export function commitPlan({ stagedCount, unstagedCount, message }: CommitPlanInput): CommitPlan {
  const hasMessage = message.trim().length > 0
  if (stagedCount > 0) {
    return {
      canCommit: hasMessage,
      includeAll: false,
      label: 'Commit',
      description: `Commit ${stagedCount} staged`,
    }
  }
  if (unstagedCount > 0) {
    return {
      canCommit: hasMessage,
      includeAll: true,
      label: 'Commit all',
      description: `Commit all ${unstagedCount} ${unstagedCount === 1 ? 'change' : 'changes'}`,
    }
  }
  return { canCommit: false, includeAll: false, label: 'Commit', description: 'Nothing to commit' }
}
