import type { GitChangeKind, GitFileChange, GitStatus } from '@shared/git'

const CHANGE_CODES: Readonly<Record<string, GitChangeKind>> = {
  M: 'modified',
  T: 'type-changed',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
}

/** Field counts before the path in `git status --porcelain=v2` records. */
const ORDINARY_FIELDS = 8
const RENAME_FIELDS = 9
const UNMERGED_FIELDS = 10

function changeKind(code: string | undefined): GitChangeKind | null {
  return code ? (CHANGE_CODES[code] ?? null) : null
}

/** Splits off the first `count` space-separated fields; the rest (the path) may contain spaces. */
function fieldsAndPath(entry: string, count: number): { fields: string[]; path: string } {
  const fields = entry.split(' ', count)
  const path = entry.slice(fields.join(' ').length + 1)
  return { fields, path }
}

function ordinaryChange(entry: string, fieldCount: number): GitFileChange {
  const { fields, path } = fieldsAndPath(entry, fieldCount)
  const xy = fields[1] ?? '..'
  return { path, staged: changeKind(xy[0]), unstaged: changeKind(xy[1]) }
}

/**
 * Parses `git status --porcelain=v2 --branch -z`. Records are NUL-terminated; a rename
 * record is followed by one extra NUL-terminated field holding the original path.
 */
export function parseStatus(output: string): GitStatus {
  const entries = output.split('\0')
  const files: GitFileChange[] = []
  let branch: string | null = null
  let upstream: string | null = null
  let ahead = 0
  let behind = 0
  let isUnborn = false

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index] ?? ''
    if (entry.startsWith('# branch.oid ')) isUnborn = entry.endsWith('(initial)')
    else if (entry.startsWith('# branch.head ')) {
      const head = entry.slice('# branch.head '.length)
      branch = head === '(detached)' ? null : head
    } else if (entry.startsWith('# branch.upstream ')) upstream = entry.slice(18)
    else if (entry.startsWith('# branch.ab ')) {
      const [, aheadText, behindText] = entry.split(' ').slice(1)
      ahead = Math.abs(Number(aheadText))
      behind = Math.abs(Number(behindText))
    } else if (entry.startsWith('1 ')) files.push(ordinaryChange(entry, ORDINARY_FIELDS))
    else if (entry.startsWith('2 ')) {
      const change = ordinaryChange(entry, RENAME_FIELDS)
      const originalPath = entries[++index] ?? ''
      files.push({ ...change, originalPath })
    } else if (entry.startsWith('u ')) {
      const { path } = fieldsAndPath(entry, UNMERGED_FIELDS)
      files.push({ path, staged: null, unstaged: 'conflicted' })
    } else if (entry.startsWith('? ')) {
      files.push({ path: entry.slice(2), staged: null, unstaged: 'untracked' })
    }
  }

  return { branch, upstream, ahead, behind, isUnborn, files }
}
