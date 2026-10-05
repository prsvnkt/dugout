import { useEffect, useRef, useState } from 'react'
import { dugout } from '@renderer/lib/dugout'
import { useAuthStore } from './authStore'
import styles from './GitHub.module.css'

const COPIED_FEEDBACK_MS = 1_500

function Unconfigured() {
  return (
    <>
      <p>GitHub sign-in needs a one-time setup: a GitHub OAuth App for Dugout.</p>
      <ol className={styles.steps}>
        <li>GitHub → Settings → Developer settings → OAuth Apps → New OAuth App.</li>
        <li>Name it “Dugout”; any homepage and callback URL; tick “Enable Device Flow”.</li>
        <li>
          Put its Client ID in <code>src/main/services/github/config.ts</code> (or set{' '}
          <code>DUGOUT_GITHUB_CLIENT_ID</code>) and restart.
        </li>
      </ol>
    </>
  )
}

/** GitHub device-flow sign-in: show the code, open GitHub, wait for approval. */
export function SignInDialog() {
  const { auth, isDialogOpen, startError, closeDialog, signIn } = useAuthStore()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [isCopied, setIsCopied] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isDialogOpen && !dialog.open) dialog.showModal()
    if (!isDialogOpen && dialog.open) dialog.close()
  }, [isDialogOpen])

  useEffect(() => {
    if (!isCopied) return
    const timer = window.setTimeout(() => setIsCopied(false), COPIED_FEEDBACK_MS)
    return () => window.clearTimeout(timer)
  }, [isCopied])

  const copyCode = async (code: string) => {
    await navigator.clipboard.writeText(code)
    setIsCopied(true)
  }

  const error = startError ?? (auth.status === 'signed-out' ? auth.error : undefined)

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      onClose={closeDialog}
      aria-label="Sign in to GitHub"
    >
      <div className={styles.body}>
        <h2 className={styles.title}>Sign in to GitHub</h2>
        {auth.status === 'unconfigured' && <Unconfigured />}
        {auth.status === 'pending' && (
          <>
            <p>Enter this code on GitHub to connect Dugout:</p>
            <div className={styles.codeRow}>
              <code className={styles.code} aria-label="Sign-in code">
                {auth.prompt.userCode}
              </code>
              <button onClick={() => void copyCode(auth.prompt.userCode)}>
                {isCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <button
              className={styles.primary}
              onClick={() => void dugout.github.openVerificationPage()}
            >
              Open GitHub
            </button>
            <p className={styles.waiting} role="status">
              Waiting for you to approve in the browser…
            </p>
          </>
        )}
        {auth.status === 'signed-out' && !error && <p role="status">Starting…</p>}
        {error && (
          <>
            <p className={styles.error} role="alert">
              {error}
            </p>
            <button className={styles.primary} onClick={() => void signIn()}>
              Try again
            </button>
          </>
        )}
        <div className={styles.actions}>
          <button onClick={closeDialog}>{auth.status === 'pending' ? 'Cancel' : 'Close'}</button>
        </div>
      </div>
    </dialog>
  )
}
