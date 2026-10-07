import { useCallback, useEffect, useState } from 'react'
import type { CloneProgress } from '@shared/clone'
import type { GitHubRepo } from '@shared/github'
import type { AgentCliCheck, LocalRepo } from '@shared/welcome'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { dugout } from '@renderer/lib/dugout'
import { mergeLocalRepos } from './repoLists'

const UNKNOWN_CHECK: AgentCliCheck = { claude: { state: 'unknown' }, codex: { state: 'unknown' } }

function messageOf(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

/** Adds a folder as a project (named after it, in a random colour). */
export function useAddFolder(): (rootPath: string) => Promise<void> {
  const add = useProjectsStore((state) => state.add)
  return useCallback(
    async (rootPath) => {
      await add({ rootPath })
    },
    [add],
  )
}

export interface LocalRepoSearch {
  /** null while the first search runs. */
  readonly repos: readonly LocalRepo[] | null
  readonly hasSearchedDocuments: boolean
  readonly error: string | null
  searchDocuments(): void
}

/** Repos in the usual code folders now; Documents and Desktop only when asked (macOS prompts). */
export function useLocalRepos(): LocalRepoSearch {
  const [repos, setRepos] = useState<readonly LocalRepo[] | null>(null)
  const [hasSearchedDocuments, setHasSearchedDocuments] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    void dugout.welcome.findRepos('common').then((result) => {
      if (isCancelled) return
      setRepos(result.ok ? result.data : [])
      if (!result.ok) setError(result.error)
    })
    return () => {
      isCancelled = true
    }
  }, [])

  const searchDocuments = useCallback(() => {
    setHasSearchedDocuments(true)
    void dugout.welcome.findRepos('documents').then((result) => {
      if (result.ok) setRepos((current) => mergeLocalRepos(current ?? [], result.data))
      else setError(result.error)
    })
  }, [])

  return { repos, hasSearchedDocuments, error, searchDocuments }
}

/** null while checking. `recheck` runs the check again (e.g. after installing a CLI). */
export function useAgentCheck(): { check: AgentCliCheck | null; recheck(): void } {
  const [check, setCheck] = useState<AgentCliCheck | null>(null)
  const [round, setRound] = useState(0)

  useEffect(() => {
    let isCancelled = false
    void dugout.welcome.checkAgents().then((result) => {
      if (!isCancelled) setCheck(result.ok ? result.data : UNKNOWN_CHECK)
    })
    return () => {
      isCancelled = true
    }
  }, [round])

  const recheck = useCallback(() => {
    setCheck(null)
    setRound((value) => value + 1)
  }, [])
  return { check, recheck }
}

export type RepoListState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'loaded'; readonly repos: readonly GitHubRepo[] }
  | { readonly kind: 'failed'; readonly error: string }

/** The signed-in user's GitHub repositories. */
export function useGitHubRepos(): RepoListState {
  const [state, setState] = useState<RepoListState>({ kind: 'loading' })

  useEffect(() => {
    let isCancelled = false
    void dugout.github.listRepos().then((result) => {
      if (isCancelled) return
      setState(
        result.ok
          ? { kind: 'loaded', repos: result.data }
          : { kind: 'failed', error: result.error },
      )
    })
    return () => {
      isCancelled = true
    }
  }, [])

  return state
}

export interface QuickClone {
  /** Where clones go: the folder remembered from the last clone. */
  readonly parentDir: string | null
  /** The clone URL being cloned right now. */
  readonly cloningUrl: string | null
  readonly progress: CloneProgress | null
  readonly error: string | null
  clone(repo: GitHubRepo): void
}

/** One-click clone into the remembered folder, then open it as a project. */
export function useQuickClone(): QuickClone {
  const addFolder = useAddFolder()
  const [parentDir, setParentDir] = useState<string | null>(null)
  const [cloningUrl, setCloningUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void dugout.clone.defaults().then((result) => {
      if (result.ok) setParentDir(result.data.parentDir)
    })
    return dugout.clone.onProgress(setProgress)
  }, [])

  const clone = useCallback(
    (repo: GitHubRepo) => {
      if (!parentDir) return
      setCloningUrl(repo.cloneUrl)
      setProgress(null)
      setError(null)
      void (async () => {
        try {
          const request = { url: repo.cloneUrl, parentDir, folderName: repo.name }
          const result = await dugout.clone.start(request)
          if (!result.ok) throw new Error(result.error)
          // Adding the project replaces this screen, so there is no state to reset.
          await addFolder(result.data)
        } catch (cause) {
          setError(messageOf(cause, 'Could not clone the repository.'))
          setCloningUrl(null)
        }
      })()
    },
    [parentDir, addFolder],
  )

  return { parentDir, cloningUrl, progress, error, clone }
}
