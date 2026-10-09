/** Lines of one file a review comment is about, with their text as the diff showed it. */
export interface CommentedLines {
  /** Path relative to the checkout root, as the agent sees it. */
  readonly path: string
  /** 1-based, inclusive. */
  readonly startLine: number
  readonly endLine: number
  readonly code: string
}

export interface CommentContent extends CommentedLines {
  readonly text: string
}

/** The prompt's first line (also what an agent started with the comments shows first). */
export const REVIEW_PROMPT_HEADING = 'Review comments on your changes. Please address each one:'

/** Longer quotes are clipped: the location already tells the agent where to look. */
export const MAX_QUOTED_LINES = 12

/** `path:line`, or `path:start-end` for several lines. */
export function lineLabel({ path, startLine, endLine }: Omit<CommentedLines, 'code'>): string {
  return startLine === endLine ? `${path}:${startLine}` : `${path}:${startLine}-${endLine}`
}

function quote(code: string): string[] {
  const lines = code.split('\n')
  const shown = lines.slice(0, MAX_QUOTED_LINES).map((line) => (line ? `> ${line}` : '>'))
  const hidden = lines.length - shown.length
  return hidden > 0 ? [...shown, `> … (${hidden} more lines)`] : shown
}

/** One prompt for an agent: every comment as `path:line`, the quoted code, then the comment. */
export function formatReviewPrompt(comments: readonly CommentContent[]): string {
  const entries = comments.map((comment, index) =>
    [`${index + 1}. ${lineLabel(comment)}`, ...quote(comment.code), comment.text.trim()].join('\n'),
  )
  return [REVIEW_PROMPT_HEADING, ...entries].join('\n\n')
}

/** An editor selection (or bare cursor), as 1-based lines and columns. */
export interface EditorSelection {
  readonly startLine: number
  readonly startColumn: number
  readonly endLine: number
  readonly endColumn: number
}

/** The whole lines a selection covers, ignoring a last line it only touches at column 1. */
export function selectedLines(selection: EditorSelection): { startLine: number; endLine: number } {
  const isBackwards =
    selection.endLine < selection.startLine ||
    (selection.endLine === selection.startLine && selection.endColumn < selection.startColumn)
  const [start, end] = isBackwards
    ? [
        { line: selection.endLine, column: selection.endColumn },
        { line: selection.startLine, column: selection.startColumn },
      ]
    : [
        { line: selection.startLine, column: selection.startColumn },
        { line: selection.endLine, column: selection.endColumn },
      ]
  const endLine = end.line > start.line && end.column === 1 ? end.line - 1 : end.line
  return { startLine: start.line, endLine }
}
