import { Logo } from '@renderer/lib/Logo'
import { AgentCheckList } from './AgentCheckList'
import { GitHubSection } from './GitHubSection'
import { LocalRepoList } from './LocalRepoList'
import styles from './Welcome.module.css'

const STEPS = [
  { title: 'Add a project', text: 'Any git repository, on this Mac or on GitHub.' },
  {
    title: 'Run agents side by side',
    text: 'Claude Code and Codex in real terminals, each in its own worktree if you like.',
  },
  { title: 'Review what changed', text: 'Diffs, commits and pull requests in the Git panel.' },
]

interface WelcomeScreenProps {
  onAddProject(): void
  onClone(): void
}

/** What the app shows before any project exists: ways to add one, and a setup check. */
export function WelcomeScreen({ onAddProject, onClone }: WelcomeScreenProps) {
  return (
    <div className={styles.welcome}>
      <div className={styles.column}>
        <header className={styles.hero}>
          <div className={styles.brand}>
            <Logo size={56} />
            <div className={styles.brandText}>
              <h1 className={styles.title}>Welcome to Dugout</h1>
              <p className={styles.subtitle}>
                Run coding agents across your projects in one window, and review what they change.
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <button className={styles.heroPrimary} onClick={onAddProject}>
              Add project…
            </button>
            <button className={styles.heroSecondary} onClick={onClone}>
              Clone repository…
            </button>
          </div>
        </header>
        <ol className={styles.steps} aria-label="How Dugout works">
          {STEPS.map((step) => (
            <li key={step.title} className={styles.step}>
              <span className={styles.stepTitle}>{step.title}</span>
              <span className={styles.stepText}>{step.text}</span>
            </li>
          ))}
        </ol>
        <div className={styles.columns}>
          <div className={styles.side}>
            <LocalRepoList />
          </div>
          <div className={styles.side}>
            <GitHubSection onBrowseAll={onClone} />
            <AgentCheckList />
          </div>
        </div>
      </div>
    </div>
  )
}
