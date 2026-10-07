import { useState } from 'react'
import type { LocalRepo } from '@shared/welcome'
import { formatAge } from '@renderer/lib/formatAge'
import start from '@renderer/features/start/StartScreen.module.css'
import { parentFolderName } from './repoLists'
import { useAddFolder, useLocalRepos } from './useWelcomeData'
import styles from './Welcome.module.css'

const SHOWN_REPOS = 8

function describe(repo: LocalRepo): string {
  const age = formatAge(new Date(repo.modifiedAt).toISOString())
  return `in ${parentFolderName(repo.path)} · changed ${age}`
}

/** Git repositories already on this Mac, each added as a project in one click. */
export function LocalRepoList() {
  const { repos, hasSearchedDocuments, error, searchDocuments } = useLocalRepos()
  const addFolder = useAddFolder()
  const [isExpanded, setIsExpanded] = useState(false)
  const [addingPath, setAddingPath] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  const add = (repo: LocalRepo) => {
    setAddingPath(repo.path)
    setAddError(null)
    addFolder(repo.path).catch((cause: unknown) => {
      setAddError(cause instanceof Error ? cause.message : 'Could not add the project.')
      setAddingPath(null)
    })
  }

  const shown = isExpanded ? repos : repos?.slice(0, SHOWN_REPOS)
  const hiddenCount = (repos?.length ?? 0) - (shown?.length ?? 0)
  const shownError = addError ?? error

  return (
    <section className={start.section} aria-label="On this Mac">
      <h2 className={start.sectionHeading}>On this Mac</h2>
      {repos === null && <p className={styles.muted}>Looking for repositories…</p>}
      {shown?.length === 0 && (
        <p className={styles.muted}>No repositories in your usual code folders.</p>
      )}
      {shown && shown.length > 0 && (
        <ul className={start.list} aria-label="Repositories on this Mac">
          {shown.map((repo) => (
            <li key={repo.path}>
              <button
                className={start.row}
                title={repo.path}
                disabled={addingPath !== null}
                onClick={() => add(repo)}
              >
                <span className={start.rowText}>
                  <span className={start.rowTitle}>{repo.name}</span>
                  <span className={start.rowMeta}>{describe(repo)}</span>
                </span>
                <span className={start.rowAction}>
                  {addingPath === repo.path ? 'Adding…' : 'Add'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.footer}>
        {hiddenCount > 0 && (
          <button className={styles.linkButton} onClick={() => setIsExpanded(true)}>
            Show {hiddenCount} more
          </button>
        )}
        {!hasSearchedDocuments && (
          <>
            <button className={styles.linkButton} onClick={searchDocuments}>
              Also look in Documents and Desktop
            </button>
            <span>macOS will ask for permission.</span>
          </>
        )}
      </div>
      {shownError && (
        <p className={start.error} role="alert">
          {shownError}
        </p>
      )}
    </section>
  )
}
