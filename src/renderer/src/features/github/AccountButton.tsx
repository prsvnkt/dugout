import { useState } from 'react'
import { isSignedIn, useAuthStore } from './authStore'
import styles from './GitHub.module.css'

/** Title bar: sign in to GitHub, or the signed-in account (marked offline when unreachable). */
export function AccountButton() {
  const auth = useAuthStore((state) => state.auth)
  const signIn = useAuthStore((state) => state.signIn)
  const signOut = useAuthStore((state) => state.signOut)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  if (!isSignedIn(auth)) {
    return (
      <button className={styles.account} onClick={() => void signIn()}>
        <span className={styles.githubMark} aria-hidden>
          ●
        </span>
        Sign in to GitHub
      </button>
    )
  }

  const account = auth.status === 'signed-in' || auth.status === 'offline' ? auth.account : null
  const isOffline = auth.status === 'offline'
  const login = account?.login ?? 'GitHub'

  return (
    <div className={styles.accountWrap}>
      <button
        className={styles.account}
        data-offline={isOffline}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-expanded={isMenuOpen}
        aria-label={`GitHub account ${login}${isOffline ? ' (offline)' : ''}`}
        title={isOffline ? 'Can’t reach GitHub — retrying automatically' : undefined}
      >
        {account && <img className={styles.avatar} src={account.avatarUrl} alt="" />}
        <span className={styles.login}>{login}</span>
        {isOffline && (
          <span className={styles.offline} aria-hidden>
            offline
          </span>
        )}
      </button>
      {isMenuOpen && (
        <button
          className={styles.menuItem}
          onClick={() => {
            setIsMenuOpen(false)
            void signOut()
          }}
        >
          Sign out of GitHub
        </button>
      )}
    </div>
  )
}
