const MAX_SLUG_LENGTH = 40
const MAX_BODY_IN_PROMPT = 6_000

/** Worktree/branch name for a task: dugout/<number>-<slug>. */
export function taskBranchName(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/, '')
  return `${number}-${slug || 'task'}`
}

/** The task a dugout/<number>-… branch was started for, if any. */
export function taskNumberFromBranch(branch: string | null): number | null {
  const match = branch ? /^dugout\/(\d+)-/.exec(branch) : null
  return match?.[1] ? Number(match[1]) : null
}

/** First message for an agent started on a task. */
export function taskPrompt(task: {
  number: number
  title: string
  body: string
  url: string
}): string {
  const body = task.body.trim()
  const trimmed =
    body.length > MAX_BODY_IN_PROMPT
      ? `${body.slice(0, MAX_BODY_IN_PROMPT)}\n…(truncated; see the issue)`
      : body
  return [
    `You are working on GitHub issue #${task.number}: ${task.title}`,
    task.url,
    '',
    trimmed || '(No description.)',
    '',
    'You are in a dedicated git worktree on its own branch. Use the dugout task tools to read',
    'the issue and its comments, post short progress notes on it, and create follow-up tasks if',
    'needed. When you are done, summarise what you changed and how you verified it.',
  ].join('\n')
}
