import { ChevronsRight, Minus, Plus } from 'lucide-react'
import type { GitFileChange, GitStatus } from '@shared/git'
import type { Project } from '@shared/project'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { useSelectedCheckout } from '@renderer/features/workspace/workspaceStore'
import { CheckoutPicker } from '@renderer/features/worktrees/CheckoutPicker'
import { useProjectWorktrees } from '@renderer/features/worktrees/worktreeStore'
import { ChangeSection, type ChangeEntry, type GitSelection } from './ChangeSection'
import { BranchPicker } from './branches/BranchPicker'
import { FetchButton } from './FetchButton'
import { CommitBox } from './CommitBox'
import { isAuthError, useAuthStore } from '@renderer/features/github/authStore'
import { useCheckoutGit, useGitStore } from './gitStore'
import { PullRequestBlock } from './PullRequestBlock'
import { usePullRequestStatus } from './usePullRequestStatus'
import { dugout } from '@renderer/lib/dugout'
import { Icon } from '@renderer/lib/Icon'
import styles from './GitPanel.module.css'

interface GitPanelProps {
  readonly project: Project
}

function entries(files: readonly GitFileChange[], side: 'staged' | 'unstaged'): ChangeEntry[] {
  return files.flatMap((file) => {
    const kind = file[side]
    const stats = (side === 'staged' ? file.stagedStats : file.unstagedStats) ?? null
    return kind ? [{ path: file.path, kind, stats }] : []
  })
}

/** The checked-out branch; shown when there are no worktrees to pick between. */
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
  const checkout = useSelectedCheckout(project.id)
  const git = useCheckoutGit(checkout)
  const pullRequest = usePullRequestStatus(checkout, git.status)
  const actions = useGitStore()
  const id = checkout
  const openDiff = useEditorStore((state) => state.openDiff)
  const signIn = useAuthStore((state) => state.signIn)
  const setPanelOpen = useGitStore((state) => state.setPanelOpen)
  const hasWorktrees = useProjectWorktrees(project.id).length > 0
  const { tabs, activeTabId } = useProjectTabs(project.id)
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  const selection: GitSelection | null =
    activeTab?.kind === 'diff' && activeTab.worktreePath === (checkout.worktreePath ?? null)
      ? { path: activeTab.path, staged: activeTab.staged }
      : null

  const hideButton = (
    <button
      className={styles.hide}
      onClick={() => setPanelOpen(false)}
      title="Hide source control (⇧⌘G)"
      aria-label="Hide Git panel"
    >
      <Icon icon={ChevronsRight} />
    </button>
  )

  if (!git.status) {
    return (
      <aside className={styles.panel} aria-label="Source control">
        <header className={styles.header}>
          <span className={styles.heading}>Source Control</span>
          {hideButton}
        </header>
        <CheckoutPicker project={project} />
        <p className={styles.notice}>{git.statusError ?? 'Loading git status…'}</p>
      </aside>
    )
  }

  const staged = entries(git.status.files, 'staged')
  const unstaged = entries(git.status.files, 'unstaged')
  const push = pushLabel(git.status)
  const select = (staged: boolean) => (path: string) =>
    openDiff(project.id, checkout.worktreePath ?? null, path, staged)

  return (
    <aside className={styles.panel} aria-label="Source control">
      <header className={styles.header}>
        <span className={styles.heading}>Source Control</span>
        {push && (
          <button
            className={styles.pushButton}
            onClick={() => void actions.push(id)}
            disabled={git.isBusy}
          >
            {push}
          </button>
        )}
        {pullRequest && (pullRequest.state === 'open' || pullRequest.state === 'draft') ? (
          <button
            className={styles.pushButton}
            onClick={() => void dugout.git.openUrl(pullRequest.url)}
            title="Open the pull request on GitHub"
          >
            Open PR
          </button>
        ) : (
          canOpenPullRequest(git.status) && (
            <button
              className={styles.pushButton}
              onClick={() => void actions.openPullRequest(id)}
              disabled={git.isBusy}
              title="Push if needed, then open a new pull request in your browser"
            >
              Create PR
            </button>
          )
        )}
        {hideButton}
      </header>
      {hasWorktrees && <CheckoutPicker project={project} />}
      <div className={styles.branchRow}>
        <BranchPicker checkout={checkout} currentBranch={git.status.branch}>
          <BranchSummary status={git.status} />
        </BranchPicker>
        <FetchButton checkout={checkout} isBusy={git.isBusy} />
      </div>
      {pullRequest && <PullRequestBlock pullRequest={pullRequest} />}
      <CommitBox
        stagedCount={staged.length}
        unstagedCount={unstaged.length}
        branch={git.status.branch}
        isBusy={git.isBusy}
        onCommit={(message, options) => actions.commit(id, message, options)}
      />

      {git.actionError && (
        <div className={styles.error} role="alert">
          {git.actionError}
          {isAuthError(git.actionError) && (
            <button className={styles.signIn} onClick={() => void signIn()}>
              Sign in to GitHub
            </button>
          )}
        </div>
      )}

      <div className={styles.changes}>
        {staged.length + unstaged.length === 0 && (
          <p className={styles.notice}>No changes. Working tree clean.</p>
        )}
        <ChangeSection
          title="Staged Changes"
          entries={staged}
          isStaged
          selection={selection}
          isBusy={git.isBusy}
          bulkLabel="Unstage all"
          bulkIcon={Minus}
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
          selection={selection}
          isBusy={git.isBusy}
          bulkLabel="Stage all"
          bulkIcon={Plus}
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
    </aside>
  )
}
