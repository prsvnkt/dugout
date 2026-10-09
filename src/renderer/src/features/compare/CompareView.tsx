import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { CompareTarget, WorktreeChanges } from '@shared/compare'
import type { ProjectId } from '@shared/project'
import { dugout } from '@renderer/lib/dugout'
import {
  ReviewComments,
  type CommentTarget,
} from '@renderer/features/reviewComments/ReviewComments'
import { compareFiles } from './compareFiles'
import styles from './CompareView.module.css'

const CompareDiff = lazy(() => import('@renderer/features/editor/monaco/CompareDiff'))

const COMMENT_HINT =
  'Comment for an agent: select lines on its side, then press ⌘⇧M or right-click › Add Review Comment.'

interface CompareViewProps {
  readonly projectId: ProjectId
  readonly tabId: string
  readonly target: CompareTarget
}

async function readSide(projectId: ProjectId, worktreePath: string, path: string): Promise<string> {
  const result = await dugout.files.read({ projectId, worktreePath }, path)
  return result.ok && !result.data.isBinary ? result.data.content : ''
}

/** Two agents' worktrees side by side: which files each changed, and how they differ. */
export function CompareView({ projectId, tabId, target }: CompareViewProps) {
  const [left, right] = target.sides
  const [changes, setChanges] = useState<readonly WorktreeChanges[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [contents, setContents] = useState<{
    path: string
    left: string
    right: string
  } | null>(null)

  useEffect(() => {
    void dugout.compare
      .changes(projectId, [left.worktreePath, right.worktreePath])
      .then((result) => {
        if (result.ok) setChanges(result.data)
        else setError(result.error)
      })
  }, [projectId, left.worktreePath, right.worktreePath])

  useEffect(() => {
    if (!selected) return
    let isCancelled = false
    void Promise.all([
      readSide(projectId, left.worktreePath, selected),
      readSide(projectId, right.worktreePath, selected),
    ]).then(([leftText, rightText]) => {
      if (!isCancelled) setContents({ path: selected, left: leftText, right: rightText })
    })
    return () => {
      isCancelled = true
    }
  }, [projectId, left.worktreePath, right.worktreePath, selected])

  const files = useMemo(() => (changes ? compareFiles(changes) : []), [changes])
  const commentTargets = useMemo(
    (): readonly CommentTarget[] =>
      [left, right].map((side) => ({
        checkout: { projectId, worktreePath: side.worktreePath },
        label: side.label,
      })),
    [projectId, left, right],
  )
  const who = (changedIn: readonly number[]) =>
    changedIn.length === 2
      ? 'both'
      : changedIn[0] === 0
        ? `${left.label} only`
        : `${right.label} only`

  return (
    <section className={styles.view} aria-label={`Compare ${left.label} and ${right.label}`}>
      <aside className={styles.files} aria-label="Changed files">
        <header className={styles.heading}>
          {left.label} vs {right.label}
        </header>
        {error && <p className={styles.error}>{error}</p>}
        {changes && files.length === 0 && (
          <p className={styles.muted}>Neither agent changed anything yet.</p>
        )}
        <ul className={styles.list}>
          {files.map((file) => (
            <li key={file.path}>
              <button
                className={styles.file}
                aria-pressed={file.path === selected}
                onClick={() => setSelected(file.path)}
                aria-label={`${file.path}, ${who(file.changedIn)}`}
              >
                <span className={styles.path}>{file.path}</span>
                <span className={styles.who} data-both={file.changedIn.length === 2}>
                  {who(file.changedIn)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className={styles.diff}>
        <div className={styles.sideLabels} aria-hidden>
          <span>{left.label}</span>
          <span>{right.label}</span>
        </div>
        {selected && contents?.path === selected ? (
          <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
            <CompareDiff
              projectId={projectId}
              tabId={tabId}
              worktreePaths={[left.worktreePath, right.worktreePath]}
              path={selected}
              left={contents.left}
              right={contents.right}
            />
          </Suspense>
        ) : (
          <p className={styles.muted}>Pick a file to compare the two versions.</p>
        )}
        <ReviewComments targets={commentTargets} hint={COMMENT_HINT} />
      </div>
    </section>
  )
}
