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

/** One comment in a pull request review thread. */
export interface ReviewThreadComment {
  readonly author: string
  readonly body: string
}

/** An unresolved review thread on a pull request, with its comments oldest first. */
export interface PullReviewThread {
  readonly path: string
  /** 1-based lines the thread is on (its original lines when outdated); null for a whole file. */
  readonly startLine: number | null
  readonly line: number | null
  /** The code changed since the comment was made. */
  readonly isOutdated: boolean
  readonly comments: readonly ReviewThreadComment[]
}

/** A problem a check run reported on a line, e.g. a lint or compiler error. */
export interface CheckAnnotation {
  readonly path: string
  readonly line: number | null
  readonly level: string
  readonly message: string
}

/** A failing CI check on the pull request's head, with what it said about the failure. */
export interface FailingCheck {
  readonly name: string
  readonly url: string | null
  readonly title: string | null
  readonly summary: string | null
  readonly annotations: readonly CheckAnnotation[]
  /** The last lines of the job's log (GitHub Actions only), cleaned of colours and timestamps. */
  readonly logTail: string | null
}
