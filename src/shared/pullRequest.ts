export type PullRequestState = 'open' | 'draft' | 'merged' | 'closed'
export type ReviewState = 'approved' | 'changes-requested' | 'none'
export type CheckState = 'passing' | 'failing' | 'pending' | 'skipped'

export interface CheckRun {
  readonly name: string
  readonly state: CheckState
  readonly url: string | null
}

export interface ChecksSummary {
  /** failing if any failed, pending if any still run, none when there are no checks. */
  readonly state: 'passing' | 'failing' | 'pending' | 'none'
  readonly passed: number
  readonly total: number
  readonly runs: readonly CheckRun[]
}

/** The pull request for a branch, with its review decision and CI checks. */
export interface PullRequestStatus {
  readonly number: number
  readonly title: string
  readonly url: string
  readonly state: PullRequestState
  readonly review: ReviewState
  readonly checks: ChecksSummary
}
