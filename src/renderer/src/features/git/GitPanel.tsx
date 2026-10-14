import { useShallow } from 'zustand/react/shallow'
import { ChevronsRight, Minus, Plus } from 'lucide-react'
import type { GitFileChange, GitStatus } from '@shared/git'
import type { Project, ProjectId } from '@shared/project'
import type { GitCheckout } from '@shared/worktree'
import { useEditorStore, useProjectTabs } from '@renderer/features/editor/editorStore'
import { useSelectedCheckout } from '@renderer/features/workspace/workspaceStore'
import { CheckoutPicker } from '@renderer/features/worktrees/CheckoutPicker'
import { useProjectWorktrees } from '@renderer/features/worktrees/worktreeStore'
import { ChangeSection, type ChangeEntry, type GitSelection } from './ChangeSection'
import { BranchPicker } from './branches/BranchPicker'
import { FetchButton } from './FetchButton'
import { CommitBox } from './CommitBox'
import { isAuthError, useAuthStore } from '@renderer/features/github/authStore'
import { selectCheckoutActions, useCheckoutGit, useGitStore } from './gitStore'
import { PullRequestBlock } from './PullRequestBlock'
import { PreviewBlock } from '@renderer/features/preview/PreviewBlock'
import { usePullRequestStatus } from './usePullRequestStatus'
import { dugout } from '@renderer/lib/dugout'
import { Icon } from '@renderer/lib/Icon'
import styles from './GitPanel.module.css'

interface GitPanelProps {
  readonly project: Project
}

type PullRequestStatus = ReturnType<typeof usePullRequestStatus>

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

function HideButton() {
  const setPanelOpen = useGitStore((state) => state.setPanelOpen)
  return (
    <button
      className={styles.hide}
      onClick={() => setPanelOpen(false)}
      title="Hide source control (⇧⌘G)"
      aria-label="Hide Git panel"
    >
      <Icon icon={ChevronsRight} />
    </button>
  )
}

interface HeaderActionsProps {
  readonly checkout: GitCheckout
  readonly status: GitStatus
  readonly isBusy: boolean
  readonly pullRequest: PullRequestStatus
}

/** Push / Publish, and Open PR or Create PR. */
function HeaderActions({ checkout, status, isBusy, pullRequest }: HeaderActionsProps) {
  const actions = useGitStore(useShallow(selectCheckoutActions))
  const push = pushLabel(status)
  const isPullRequestOpen =
    pullRequest && (pullRequest.state === 'open' || pullRequest.state === 'draft')
  return (
    <>
      {push && (
        <button
          className={styles.pushButton}
          onClick={() => void actions.push(checkout)}
          disabled={isBusy}
        >
          {push}
        </button>
      )}
      {isPullRequestOpen ? (
        <button
          className={styles.pushButton}
          onClick={() => void dugout.git.openUrl(pullRequest.url)}
          title="Open the pull request on GitHub"
        >
          Open PR
        </button>
      ) : (
        canOpenPullRequest(status) && (
          <button
            className={styles.pushButton}
            onClick={() => void actions.openPullRequest(checkout)}
            disabled={isBusy}
            title="Push if needed, then open a new pull request in your browser"
          >
            Create PR
          </button>
        )
      )}
    </>
  )
}

function ActionError({ message }: { message: string }) {
  const signIn = useAuthStore((state) => state.signIn)
  return (
    <div className={styles.error} role="alert">
      {message}
      {isAuthError(message) && (
        <button className={styles.signIn} onClick={() => void signIn()}>
          Sign in to GitHub
        </button>
      )}
    </div>
  )
}

/** The diff tab open for this checkout, highlighted in the change lists. */
function useDiffSelection(projectId: ProjectId, checkout: GitCheckout): GitSelection | null {
  const { tabs, activeTabId } = useProjectTabs(projectId)
  const activeTab = tabs.find((tab) => tab.id === activeTabId)
  return activeTab?.kind === 'diff' && activeTab.worktreePath === (checkout.worktreePath ?? null)
    ? { path: activeTab.path, staged: activeTab.staged }
    : null
}

interface ChangeListsProps {
  readonly projectId: ProjectId
  readonly checkout: GitCheckout
  readonly staged: readonly ChangeEntry[]
  readonly unstaged: readonly ChangeEntry[]
  readonly isBusy: boolean
}

function ChangeLists({ projectId, checkout, staged, unstaged, isBusy }: ChangeListsProps) {
  const actions = useGitStore(useShallow(selectCheckoutActions))
  const openDiff = useEditorStore((state) => state.openDiff)
  const selection = useDiffSelection(projectId, checkout)
  const select = (isStaged: boolean) => (path: string) =>
    openDiff(projectId, checkout.worktreePath ?? null, path, isStaged)
  const pathsOf = (list: readonly ChangeEntry[]) => list.map((entry) => entry.path)
  return (
    <div className={styles.changes}>
      {staged.length + unstaged.length === 0 && (
        <p className={styles.notice}>No changes. Working tree clean.</p>
      )}
      <ChangeSection
        title="Staged Changes"
        entries={staged}
        isStaged
        selection={selection}
        isBusy={isBusy}
        bulkLabel="Unstage all"
        bulkIcon={Minus}
        onBulk={() => void actions.unstage(checkout, pathsOf(staged))}
        onSelect={select(true)}
        onUnstage={(path) => void actions.unstage(checkout, [path])}
      />
      <ChangeSection
        title="Changes"
        entries={unstaged}
        isStaged={false}
        selection={selection}
        isBusy={isBusy}
        bulkLabel="Stage all"
        bulkIcon={Plus}
        onBulk={() => void actions.stage(checkout, pathsOf(unstaged))}
        onSelect={select(false)}
        onStage={(path) => void actions.stage(checkout, [path])}
        onDiscard={(path) => void actions.discard(checkout, [path])}
      />
    </div>
  )
}

export function GitPanel({ project }: GitPanelProps) {
  const checkout = useSelectedCheckout(project.id)
  const git = useCheckoutGit(checkout)
  const pullRequest = usePullRequestStatus(checkout, git.status)
  const commit = useGitStore((state) => state.commit)
  const hasWorktrees = useProjectWorktrees(project.id).length > 0

  if (!git.status) {
    return (
      <aside className={styles.panel} aria-label="Source control">
        <header className={styles.header}>
          <span className={styles.heading}>Source Control</span>
          <HideButton />
        </header>
        <CheckoutPicker project={project} />
        <p className={styles.notice}>{git.statusError ?? 'Loading git status…'}</p>
      </aside>
    )
  }

  const { status, isBusy } = git
  const staged = entries(status.files, 'staged')
  const unstaged = entries(status.files, 'unstaged')
  return (
    <aside className={styles.panel} aria-label="Source control">
      <header className={styles.header}>
        <span className={styles.heading}>Source Control</span>
        <HeaderActions
          checkout={checkout}
          status={status}
          isBusy={isBusy}
          pullRequest={pullRequest}
        />
        <HideButton />
      </header>
      {hasWorktrees && <CheckoutPicker project={project} />}
      <div className={styles.branchRow}>
        <BranchPicker checkout={checkout} currentBranch={status.branch}>
          <BranchSummary status={status} />
        </BranchPicker>
        <FetchButton checkout={checkout} isBusy={isBusy} />
      </div>
      {pullRequest && <PullRequestBlock checkout={checkout} pullRequest={pullRequest} />}
      <PreviewBlock project={project} checkout={checkout} status={status} />
      <CommitBox
        stagedCount={staged.length}
        unstagedCount={unstaged.length}
        branch={status.branch}
        isBusy={isBusy}
        onCommit={(message, options) => commit(checkout, message, options)}
      />
      {git.actionError && <ActionError message={git.actionError} />}
      <ChangeLists
        projectId={project.id}
        checkout={checkout}
        staged={staged}
        unstaged={unstaged}
        isBusy={isBusy}
      />
    </aside>
  )
}
