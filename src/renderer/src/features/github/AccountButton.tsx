import { useState } from 'react'
import { useAuthStore } from './authStore'
import styles from './GitHub.module.css'

/** Sidebar footer: sign in to GitHub, or the signed-in account with a sign-out action. */
export function AccountButton() {
  const auth = useAuthStore((state) => state.auth)
  const signIn = useAuthStore((state) => state.signIn)
  const signOut = useAuthStore((state) => state.signOut)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  if (auth.status !== 'signed-in') {
    return (
      <button className={styles.account} onClick={() => void signIn()}>
        <span className={styles.githubMark} aria-hidden>
          ●
        </span>
        Sign in to GitHub
      </button>
    )
  }

  return (
    <div className={styles.accountWrap}>
      <button
        className={styles.account}
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-expanded={isMenuOpen}
        aria-label={`GitHub account ${auth.account.login}`}
      >
        <img className={styles.avatar} src={auth.account.avatarUrl} alt="" />
        <span className={styles.login}>{auth.account.login}</span>
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
