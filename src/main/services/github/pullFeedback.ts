import type { CheckAnnotation, PullReviewThread } from '@shared/pullRequest'

/** What the `reviewThreads` GraphQL query returns (see `REVIEW_THREADS_QUERY`). */
export interface ReviewThreadsResponse {
  readonly data?: {
    readonly repository: {
      readonly pullRequest: {
        readonly reviewThreads: { readonly nodes: readonly ReviewThreadNode[] }
      } | null
    } | null
  }
  readonly errors?: readonly { readonly message: string }[]
}

export interface ReviewThreadNode {
  readonly isResolved: boolean
  readonly isOutdated: boolean
  readonly path: string
  readonly line: number | null
  readonly startLine: number | null
  readonly originalLine: number | null
  readonly originalStartLine: number | null
  readonly comments: {
    readonly nodes: readonly {
      readonly author: { readonly login: string } | null
      readonly body: string
    }[]
  }
}

export const MAX_REVIEW_THREADS = 100
export const MAX_THREAD_COMMENTS = 20

/** Unresolved review threads with their comments; the only way to see resolution is GraphQL. */
export const REVIEW_THREADS_QUERY = `query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: ${MAX_REVIEW_THREADS}) {
        nodes {
          isResolved isOutdated path line startLine originalLine originalStartLine
          comments(first: ${MAX_THREAD_COMMENTS}) { nodes { author { login } body } }
        }
      }
    }
  }
}`

/** The unresolved threads of a `reviewThreads` response; GraphQL errors become one Error. */
export function unresolvedThreads(response: ReviewThreadsResponse): PullReviewThread[] {
  const [error] = response.errors ?? []
  if (error) throw new Error(`GitHub: ${error.message}`)
  const pull = response.data?.repository?.pullRequest
  if (!pull) throw new Error('GitHub: that pull request was not found.')
  return pull.reviewThreads.nodes
    .filter((thread) => !thread.isResolved && thread.comments.nodes.length > 0)
    .map((thread) => {
      const line = thread.line ?? thread.originalLine
      return {
        path: thread.path,
        line,
        startLine: (thread.line === null ? thread.originalStartLine : thread.startLine) ?? line,
        isOutdated: thread.isOutdated,
        comments: thread.comments.nodes.map((comment) => ({
          author: comment.author?.login ?? 'ghost',
          body: comment.body.trim(),
        })),
      }
    })
}

export const MAX_LOG_LINES = 40
export const MAX_LOG_LINE_LENGTH = 300

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g
/** Actions prefixes every line with an ISO timestamp. */
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z ?/
const GROUP_MARKER = /^##\[(end)?group\]/
const ERROR_MARKER = '##[error]'

function cleanLine(line: string): string {
  const text = line.replace(ANSI, '').replace(TIMESTAMP, '').trimEnd()
  return text.length > MAX_LOG_LINE_LENGTH ? `${text.slice(0, MAX_LOG_LINE_LENGTH)}…` : text
}

/**
 * The part of a job log that explains the failure: the lines up to the last `##[error]` (Actions
 * appends cleanup steps after it), at most `MAX_LOG_LINES`, without colours or timestamps.
 */
export function logTail(log: string): string | null {
  const lines = log
    .split(/\r?\n/)
    .map(cleanLine)
    .filter((line) => !GROUP_MARKER.test(line))
  const lastError = lines.findLastIndex((line) => line.startsWith(ERROR_MARKER))
  const end = lastError === -1 ? lines.length : lastError + 1
  const tail = lines
    .slice(0, end)
    .slice(-MAX_LOG_LINES)
    .map((line) =>
      line.startsWith(ERROR_MARKER) ? `Error: ${line.slice(ERROR_MARKER.length)}` : line,
    )
  const text = tail.join('\n').trim()
  return text === '' ? null : text
}

/** What the check run annotations endpoint returns. */
export interface AnnotationResponse {
  readonly path: string
  readonly start_line: number | null
  readonly annotation_level: string | null
  readonly message: string
}

export const MAX_ANNOTATIONS = 10

/** Failures and warnings first; notices (e.g. "Node 16 is deprecated") are dropped as noise. */
export function checkAnnotations(annotations: readonly AnnotationResponse[]): CheckAnnotation[] {
  const rank = (level: string) => (level === 'failure' ? 0 : 1)
  return annotations
    .filter((annotation) => annotation.annotation_level !== 'notice')
    .map((annotation) => ({
      path: annotation.path,
      line: annotation.start_line,
      level: annotation.annotation_level ?? 'failure',
      message: annotation.message.trim(),
    }))
    .sort((a, b) => rank(a.level) - rank(b.level))
    .slice(0, MAX_ANNOTATIONS)
}
