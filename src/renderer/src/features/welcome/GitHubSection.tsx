import type { GitHubRepo } from '@shared/github'
import { isSignedIn, useAuthStore } from '@renderer/features/github/authStore'
import { formatAge } from '@renderer/lib/formatAge'
import start from '@renderer/features/start/StartScreen.module.css'
import { recentlyPushed } from './repoLists'
import { useGitHubRepos, useQuickClone, type QuickClone } from './useWelcomeData'
import styles from './Welcome.module.css'

const SHOWN_REPOS = 5

/** Why sign in: everything GitHub adds to Dugout. */
function SignInCard() {
  const signIn = useAuthStore((state) => state.signIn)
  return (
    <div className={styles.card}>
      <div className={styles.cardText}>
        <span className={styles.cardTitle}>Connect GitHub to get more out of Dugout</span>
        <ul className={styles.benefits}>
          <li>Clone your repositories in one click</li>
          <li>Turn issues into tasks and hand them to agents</li>
          <li>See each branch&apos;s pull request and CI checks</li>
        </ul>
      </div>
      <button className={styles.secondary} onClick={() => void signIn()}>
        Sign in to GitHub
      </button>
    </div>
  )
}

function describe(repo: GitHubRepo, quick: QuickClone): string {
  if (quick.cloningUrl === repo.cloneUrl) {
    const percent = quick.progress?.percent
    return `${quick.progress?.phase ?? 'Starting'}${percent == null ? '' : ` ${percent}%`}…`
  }
  const parts = [
    repo.isPrivate && 'Private',
    repo.pushedAt && `pushed ${formatAge(repo.pushedAt)}`,
    repo.description,
  ]
  return parts.filter(Boolean).join(' · ')
}

/** The repos pushed to most recently, each cloned and added in one click. */
function GitHubRepoList({ onBrowseAll }: { onBrowseAll(): void }) {
  const state = useGitHubRepos()
  const quick = useQuickClone()

  if (state.kind === 'loading') return <p className={styles.muted}>Loading your repositories…</p>
  if (state.kind === 'failed') {
    return (
      <p className={start.error} role="alert">
        {state.error}
      </p>
    )
  }
  const repos = recentlyPushed(state.repos, SHOWN_REPOS)
  return (
    <>
      {repos.length === 0 ? (
        <p className={styles.muted}>No repositories on your account yet.</p>
      ) : (
        <ul className={start.list} aria-label="Your GitHub repositories">
          {repos.map((repo) => (
            <li key={repo.fullName}>
              <button
                className={start.row}
                disabled={quick.cloningUrl !== null || quick.parentDir === null}
                onClick={() => quick.clone(repo)}
              >
                <span className={start.rowText}>
                  <span className={start.rowTitle}>{repo.fullName}</span>
                  <span className={start.rowMeta}>{describe(repo, quick)}</span>
                </span>
                <span className={start.rowAction}>
                  {quick.cloningUrl === repo.cloneUrl ? 'Cloning…' : 'Clone'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.footer}>
        {quick.parentDir && <span title={quick.parentDir}>Clones into {quick.parentDir}.</span>}
        <button className={styles.linkButton} onClick={onBrowseAll}>
          Browse all or choose a folder…
        </button>
      </div>
      {quick.error && (
        <p className={start.error} role="alert">
          {quick.error}
        </p>
      )}
    </>
  )
}

/** Signed in: your recent repositories. Signed out: what signing in unlocks. */
export function GitHubSection({ onBrowseAll }: { onBrowseAll(): void }) {
  const auth = useAuthStore((state) => state.auth)
  // A build without a GitHub app configured cannot sign in at all.
  if (auth.status === 'unconfigured') return null

  return (
    <section className={start.section} aria-label="GitHub">
      <h2 className={start.sectionHeading}>GitHub</h2>
      {isSignedIn(auth) ? <GitHubRepoList onBrowseAll={onBrowseAll} /> : <SignInCard />}
    </section>
  )
}
