import type { CheckAnnotation, FailingCheck, PullReviewThread } from '@shared/pullRequest'
import { lineLabel } from '@renderer/features/reviewComments/reviewPrompt'

/** Longer review comments and check summaries are clipped; the link has the rest. */
export const MAX_ENTRY_TEXT_LENGTH = 1_500

function clip(text: string, max = MAX_ENTRY_TEXT_LENGTH): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * Joins a heading and numbered entries into one prompt of at most `maxLength` characters:
 * entries that do not fit are counted at the end instead, and a lone entry is clipped.
 */
export function fitPrompt(heading: string, entries: readonly string[], maxLength: number): string {
  const moreNote = (count: number) => (count > 0 ? `\n\n… and ${count} more on GitHub.` : '')
  let prompt = heading
  for (const [index, entry] of entries.entries()) {
    // Every accepted entry leaves room for the note about the ones after it.
    const after = moreNote(entries.length - index - 1)
    const candidate = `${prompt}\n\n${entry}`
    if (candidate.length + after.length <= maxLength) {
      prompt = candidate
    } else if (index === 0) {
      const room = Math.max(0, maxLength - prompt.length - after.length - 3)
      prompt = `${prompt}\n\n${clip(entry, room)}`
    } else {
      return `${prompt}${moreNote(entries.length - index)}`
    }
  }
  return prompt
}

function threadLocation(thread: PullReviewThread): string {
  const where =
    thread.line === null
      ? thread.path
      : lineLabel({
          path: thread.path,
          startLine: thread.startLine ?? thread.line,
          endLine: thread.line,
        })
  return thread.isOutdated ? `${where} (outdated: the code has changed since)` : where
}

/** One prompt with every unresolved thread: `path:line`, then each comment as `author: text`. */
export function formatReviewThreadsPrompt(
  pullNumber: number,
  threads: readonly PullReviewThread[],
  maxLength: number,
): string {
  const heading = `Unresolved review comments on pull request #${pullNumber}. Please address each one:`
  const entries = threads.map((thread, index) =>
    [
      `${index + 1}. ${threadLocation(thread)}`,
      ...thread.comments.map((comment) => `${comment.author}: ${clip(comment.body)}`),
    ].join('\n'),
  )
  return fitPrompt(heading, entries, maxLength)
}

function annotationLine(annotation: CheckAnnotation): string {
  const where = annotation.line === null ? annotation.path : `${annotation.path}:${annotation.line}`
  return `- ${where} (${annotation.level}): ${annotation.message}`
}

function checkEntry(check: FailingCheck, index: number): string {
  const lines = [`${index + 1}. ${check.name}${check.title ? `: ${check.title}` : ''}`]
  if (check.summary) lines.push(clip(check.summary))
  if (check.annotations.length > 0) {
    lines.push('Annotations:', ...check.annotations.map(annotationLine))
  }
  if (check.logTail) lines.push('End of the log:', '```', check.logTail, '```')
  if (!check.summary && check.annotations.length === 0 && !check.logTail && check.url) {
    lines.push(`Details: ${check.url}`)
  }
  return lines.join('\n')
}

/** One prompt with every failing check: its title, summary, annotations and the end of its log. */
export function formatFailingChecksPrompt(
  pullNumber: number,
  checks: readonly FailingCheck[],
  maxLength: number,
): string {
  const heading = `CI is failing on pull request #${pullNumber}. Please find the cause and fix it:`
  return fitPrompt(heading, checks.map(checkEntry), maxLength)
}
