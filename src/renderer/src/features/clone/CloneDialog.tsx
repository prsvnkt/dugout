import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import type { CloneProgress } from '@shared/clone'
import type { GitHubRepo } from '@shared/github'
import { nextProjectColor } from '@shared/project'
import {
  isAuthError,
  isSignedIn as isSignedInState,
  useAuthStore,
} from '@renderer/features/github/authStore'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { dugout } from '@renderer/lib/dugout'
import { folderNameFromUrl } from './folderName'
import styles from './CloneDialog.module.css'

type Source = 'repos' | 'url'

function RepoList({ onPick, picked }: { onPick(repo: GitHubRepo): void; picked: string }) {
  const auth = useAuthStore((state) => state.auth)
  const signIn = useAuthStore((state) => state.signIn)
  const [repos, setRepos] = useState<readonly GitHubRepo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const isSignedIn = isSignedInState(auth)

  useEffect(() => {
    if (!isSignedIn) return
    let isCancelled = false
    void dugout.github.listRepos().then((result) => {
      if (isCancelled) return
      if (result.ok) setRepos(result.data)
      else setError(result.error)
    })
    return () => {
      isCancelled = true
    }
  }, [isSignedIn])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (repos ?? []).filter(
      (repo) =>
        !needle ||
        repo.fullName.toLowerCase().includes(needle) ||
        (repo.description ?? '').toLowerCase().includes(needle),
    )
  }, [repos, query])

  if (!isSignedIn) {
    return (
      <div className={styles.signIn}>
        <p>Sign in to GitHub to pick from your repositories.</p>
        <button type="button" onClick={() => void signIn()}>
          Sign in to GitHub
        </button>
      </div>
    )
  }
  if (error) return <p className={styles.error}>{error}</p>
  if (!repos) return <p className={styles.muted}>Loading your repositories…</p>

  return (
    <>
      <input
        className={styles.input}
        placeholder="Search repositories"
        aria-label="Search repositories"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        autoFocus
      />
      <ul className={styles.repos} aria-label="Your repositories">
        {visible.map((repo) => (
          <li key={repo.fullName}>
            <button
              type="button"
              className={styles.repo}
              aria-pressed={picked === repo.cloneUrl}
              onClick={() => onPick(repo)}
            >
              <span className={styles.repoName}>
                {repo.fullName}
                {repo.isPrivate && <span className={styles.badge}>private</span>}
              </span>
              {repo.description && <span className={styles.muted}>{repo.description}</span>}
            </button>
          </li>
        ))}
        {visible.length === 0 && <li className={styles.muted}>No repositories match.</li>}
      </ul>
    </>
  )
}

/** Clone from your GitHub repositories or any URL, then add it as a project. */
export function CloneDialog({ onClose }: { onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const signIn = useAuthStore((state) => state.signIn)
  const { projects, add } = useProjectsStore()
  const [source, setSource] = useState<Source>('repos')
  const [url, setUrl] = useState('')
  const [folderName, setFolderName] = useState('')
  const [parentDir, setParentDir] = useState('')
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [isCloning, setIsCloning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
    void dugout.clone.defaults().then((result) => {
      if (result.ok) setParentDir(result.data.parentDir)
    })
    return dugout.clone.onProgress(setProgress)
  }, [])

  const pickUrl = (next: string, name = folderNameFromUrl(next)) => {
    setUrl(next)
    setFolderName(name)
    setError(null)
  }

  const chooseParent = async () => {
    const folder = await dugout.dialog.pickFolder()
    if (folder) setParentDir(folder)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setIsCloning(true)
    setError(null)
    setProgress(null)
    const result = await dugout.clone.start({ url: url.trim(), parentDir, folderName })
    if (!result.ok) {
      setIsCloning(false)
      setError(result.error)
      return
    }
    try {
      await add({ name: folderName, rootPath: result.data, color: nextProjectColor(projects) })
      onClose()
    } catch (cause) {
      setIsCloning(false)
      setError(cause instanceof Error ? cause.message : 'Could not add the project.')
    }
  }

  const close = () => {
    if (isCloning) dugout.clone.cancel()
    onClose()
  }

  const canClone = url.trim() !== '' && folderName !== '' && parentDir !== '' && !isCloning

  return (
    <dialog ref={dialogRef} className={styles.dialog} onClose={close} aria-label="Clone repository">
      <form className={styles.form} onSubmit={(event) => void submit(event)}>
        <h2 className={styles.title}>Clone repository</h2>
        <div className={styles.tabs} role="tablist">
          {(['repos', 'url'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={source === tab}
              onClick={() => setSource(tab)}
            >
              {tab === 'repos' ? 'Your repositories' : 'URL'}
            </button>
          ))}
        </div>

        {source === 'repos' ? (
          <RepoList picked={url} onPick={(repo) => pickUrl(repo.cloneUrl, repo.name)} />
        ) : (
          <label className={styles.label}>
            Repository URL
            <input
              className={styles.input}
              value={url}
              onChange={(event) => pickUrl(event.target.value)}
              placeholder="https://github.com/owner/repo.git or git@github.com:owner/repo.git"
              autoFocus
            />
          </label>
        )}

        <div className={styles.destination}>
          {/* Not a <label>: it would become the Change… button's accessible name. */}
          <div className={styles.label} role="group" aria-label="Clone into">
            Clone into
            <span className={styles.parent}>
              <span className={styles.path} title={parentDir}>
                {parentDir || '…'}
              </span>
              <button type="button" onClick={() => void chooseParent()}>
                Change…
              </button>
            </span>
          </div>
          <label className={styles.label}>
            Folder name
            <input
              className={styles.input}
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
            />
          </label>
        </div>

        {isCloning && (
          <div className={styles.progress} role="status" aria-label="Clone progress">
            <span>
              {progress?.phase ?? 'Starting…'}
              {progress?.percent !== null &&
                progress?.percent !== undefined &&
                ` ${progress.percent}%`}
            </span>
            <progress max={100} value={progress?.percent ?? undefined} />
          </div>
        )}
        {error && (
          <div className={styles.error} role="alert">
            {error}
            {isAuthError(error) && (
              <button type="button" onClick={() => void signIn()}>
                Sign in to GitHub
              </button>
            )}
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" onClick={close}>
            Cancel
          </button>
          <button type="submit" className={styles.primary} disabled={!canClone}>
            {isCloning ? 'Cloning…' : 'Clone'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
