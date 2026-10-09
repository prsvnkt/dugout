import { useCallback, useEffect, useMemo, useState } from 'react'
import { AGENT_KINDS } from '@shared/agents'
import type { CloneProgress } from '@shared/clone'
import type { GitHubRepo } from '@shared/github'
import type { AgentCliCheck, LocalRepo } from '@shared/welcome'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { useCloneDefaultParent } from '@renderer/features/clone/useCloneDefaults'
import { dugout } from '@renderer/lib/dugout'
import { useRequest } from '@renderer/lib/useRequest'
import { mergeLocalRepos } from './repoLists'

const UNKNOWN_CHECK = Object.fromEntries(
  AGENT_KINDS.map((kind) => [kind, { state: 'unknown' }]),
) as AgentCliCheck

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

const NO_REPOS: readonly LocalRepo[] = []

/** Repos in the usual code folders now; Documents and Desktop only when asked (macOS prompts). */
export function useLocalRepos(): LocalRepoSearch {
  const common = useRequest(() => dugout.welcome.findRepos('common'), [])
  const [documents, setDocuments] = useState<readonly LocalRepo[]>(NO_REPOS)
  const [hasSearchedDocuments, setHasSearchedDocuments] = useState(false)
  const [documentsError, setDocumentsError] = useState<string | null>(null)

  const searchDocuments = useCallback(() => {
    setHasSearchedDocuments(true)
    void dugout.welcome.findRepos('documents').then((result) => {
      if (result.ok) setDocuments(result.data)
      else setDocumentsError(result.error)
    })
  }, [])

  const repos = useMemo(() => {
    if (common.kind === 'loading') return null
    return mergeLocalRepos(common.kind === 'loaded' ? common.value : NO_REPOS, documents)
  }, [common, documents])
  const error = documentsError ?? (common.kind === 'failed' ? common.message : null)

  return { repos, hasSearchedDocuments, error, searchDocuments }
}

/** null while checking. `recheck` runs the check again (e.g. after installing a CLI). */
export function useAgentCheck(): { check: AgentCliCheck | null; recheck(): void } {
  const [round, setRound] = useState(0)
  // `round` is only a trigger: bumping it runs the check again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const state = useRequest(() => dugout.welcome.checkAgents(), [round])
  const recheck = useCallback(() => setRound((value) => value + 1), [])
  const check =
    state.kind === 'loading' ? null : state.kind === 'loaded' ? state.value : UNKNOWN_CHECK
  return { check, recheck }
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
  const parentDir = useCloneDefaultParent()
  const [cloningUrl, setCloningUrl] = useState<string | null>(null)
  const [progress, setProgress] = useState<CloneProgress | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => dugout.clone.onProgress(setProgress), [])

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
