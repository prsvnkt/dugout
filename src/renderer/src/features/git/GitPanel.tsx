import type { GitFileChange, GitStatus } from '@shared/git'
import type { Project } from '@shared/project'
import { ChangeSection, type ChangeEntry } from './ChangeSection'
import { CommitBox } from './CommitBox'
import { DiffView } from './DiffView'
import { useGitStore, useProjectGit } from './gitStore'
import styles from './GitPanel.module.css'

interface GitPanelProps {
  readonly project: Project
}

function entries(files: readonly GitFileChange[], side: 'staged' | 'unstaged'): ChangeEntry[] {
  return files.flatMap((file) => {
    const kind = file[side]
    return kind ? [{ path: file.path, kind }] : []
  })
}

function BranchSummary({ status }: { status: GitStatus }) {
  return (
    <span className={styles.branch} title={status.upstream ?? 'No upstream branch'}>
      <span aria-hidden>⎇</span> {status.branch ?? 'detached HEAD'}
      {status.ahead > 0 && <span aria-label={`${status.ahead} ahead`}> ↑{status.ahead}</span>}
      {status.behind > 0 && <span aria-label={`${status.behind} behind`}> ↓{status.behind}</span>}
    </span>
  )
}

function canOpenPullRequest(status: GitStatus): boolean {
  return (
    status.branch !== null && !status.isUnborn && status.branch !== (status.baseBranch ?? 'main')
  )
}

function pushLabel(status: GitStatus): string | null {
  if (status.branch === null || status.isUnborn) return null
  if (status.upstream === null) return 'Publish'
  return status.ahead > 0 ? `Push ${status.ahead}` : null
}

export function GitPanel({ project }: GitPanelProps) {
  const git = useProjectGit(project.id)
  const actions = useGitStore()
  const id = project.id

  if (!git.status) {
    return (
      <aside className={styles.panel} aria-label="Source control">
        <p className={styles.notice}>{git.statusError ?? 'Loading git status…'}</p>
      </aside>
    )
  }

  const staged = entries(git.status.files, 'staged')
  const unstaged = entries(git.status.files, 'unstaged')
  const push = pushLabel(git.status)
  const select = (staged: boolean) => (path: string) => void actions.select(id, { path, staged })

  return (
    <aside className={styles.panel} aria-label="Source control">
      <header className={styles.header}>
        <BranchSummary status={git.status} />
        {push && (
          <button
            className={styles.pushButton}
            onClick={() => void actions.push(id)}
            disabled={git.isBusy}
          >
            {push}
          </button>
        )}
        {canOpenPullRequest(git.status) && (
          <button
            className={styles.pushButton}
            onClick={() => void actions.openPullRequest(id)}
            disabled={git.isBusy}
            title="Push if needed, then open a new pull request in your browser"
          >
            Create PR
          </button>
        )}
      </header>

      {git.actionError && (
        <p className={styles.error} role="alert">
          {git.actionError}
        </p>
      )}

      <div className={styles.changes} data-has-diff={git.selection !== null}>
        <CommitBox
          stagedCount={staged.length}
          isBusy={git.isBusy}
          onCommit={(message) => actions.commit(id, message)}
        />
        {staged.length + unstaged.length === 0 && (
          <p className={styles.notice}>No changes. Working tree clean.</p>
        )}
        <ChangeSection
          title="Staged"
          entries={staged}
          isStaged
          selection={git.selection}
          isBusy={git.isBusy}
          bulkLabel="Unstage all"
          onBulk={() =>
            void actions.unstage(
              id,
              staged.map((entry) => entry.path),
            )
          }
          onSelect={select(true)}
          onUnstage={(path) => void actions.unstage(id, [path])}
        />
        <ChangeSection
          title="Changes"
          entries={unstaged}
          isStaged={false}
          selection={git.selection}
          isBusy={git.isBusy}
          bulkLabel="Stage all"
          onBulk={() =>
            void actions.stage(
              id,
              unstaged.map((entry) => entry.path),
            )
          }
          onSelect={select(false)}
          onStage={(path) => void actions.stage(id, [path])}
          onDiscard={(path) => void actions.discard(id, [path])}
        />
      </div>

      {git.selection && (
        <DiffView
          diff={git.diff}
          path={git.selection.path}
          staged={git.selection.staged}
          onClose={() => void actions.select(id, null)}
        />
      )}
    </aside>
  )
}
