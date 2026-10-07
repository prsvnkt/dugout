import type { GitBranch, GitCommitSummary } from '@shared/git'

/** `git for-each-ref` fields, NUL-separated (a commit subject never contains NUL). */
export const BRANCH_FORMAT_FIELDS = [
  'refname',
  'objectname',
  'committerdate',
  'authorname',
  'HEAD',
  'worktreepath',
  'symref',
  'subject',
] as const

type Field = (typeof BRANCH_FORMAT_FIELDS)[number]

const FORMAT_ARG_BY_FIELD: Readonly<Record<Field, string>> = {
  refname: '%(refname)',
  objectname: '%(objectname:short)',
  committerdate: '%(committerdate:iso-strict)',
  authorname: '%(authorname)',
  HEAD: '%(HEAD)',
  worktreepath: '%(worktreepath)',
  symref: '%(symref)',
  subject: '%(subject)',
}

/** The `--format` for `git for-each-ref` that `parseBranches` reads. */
export const BRANCH_FORMAT = BRANCH_FORMAT_FIELDS.map((field) => FORMAT_ARG_BY_FIELD[field]).join(
  '%00',
)

const LOCAL_PREFIX = 'refs/heads/'
const REMOTE_PREFIX = 'refs/remotes/'

function toRecord(line: string): Record<Field, string> {
  const values = line.split('\0')
  return Object.fromEntries(
    BRANCH_FORMAT_FIELDS.map((field, index) => [field, values[index] ?? '']),
  ) as Record<Field, string>
}

function commitOf(record: Record<Field, string>): GitCommitSummary {
  return {
    sha: record.objectname,
    subject: record.subject,
    author: record.authorname,
    date: record.committerdate,
  }
}

/** Parses `git for-each-ref --format=BRANCH_FORMAT refs/heads refs/remotes` run in `root`. */
export function parseBranches(stdout: string, root: string): GitBranch[] {
  const records = stdout
    .split('\n')
    .filter(Boolean)
    .map(toRecord)
    .filter((record) => record.symref === '')
  const local: GitBranch[] = records
    .filter((record) => record.refname.startsWith(LOCAL_PREFIX))
    .map((record) => ({
      kind: 'local',
      name: record.refname.slice(LOCAL_PREFIX.length),
      isCurrent: record.HEAD === '*',
      checkedOutAt:
        record.worktreepath && record.worktreepath !== root ? record.worktreepath : null,
      commit: commitOf(record),
    }))
  const localNames = new Set(local.map((branch) => branch.name))
  const remote: GitBranch[] = records
    .filter((record) => record.refname.startsWith(REMOTE_PREFIX))
    .flatMap((record) => {
      const name = record.refname.slice(REMOTE_PREFIX.length)
      const localName = name.slice(name.indexOf('/') + 1)
      if (localNames.has(localName)) return []
      return [{ kind: 'remote' as const, name, localName, commit: commitOf(record) }]
    })
  return [...local, ...remote]
}
