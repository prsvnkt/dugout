import { useState } from 'react'
import { ExternalLink, Globe, Pencil, Play, SquareTerminal } from 'lucide-react'
import type { GitStatus } from '@shared/git'
import { devServerUrl, type DeploymentState, type PreviewDeployment } from '@shared/preview'
import type { Project } from '@shared/project'
import type { GitCheckout } from '@shared/worktree'
import { useBranchPoll } from '@renderer/features/git/useBranchPoll'
import { useProjectsStore } from '@renderer/features/projects/projectsStore'
import { dugout } from '@renderer/lib/dugout'
import { Icon } from '@renderer/lib/Icon'
import { DevCommandForm } from './DevCommandForm'
import { useDevServer } from './useDevServer'
import styles from './Preview.module.css'

const STATE_LABEL: Readonly<Record<DeploymentState, string>> = {
  ready: 'Ready',
  pending: 'Deploying',
  failed: 'Failed',
}

const loadDeployment = (checkout: GitCheckout) => dugout.preview.deployment(checkout)

interface PreviewBlockProps {
  readonly project: Project
  readonly checkout: GitCheckout
  readonly status: GitStatus
}

/** The branch's preview deployment, and the project's dev server for this checkout. */
export function PreviewBlock({ project, checkout, status }: PreviewBlockProps) {
  const deployment = useBranchPoll(checkout, status, loadDeployment)
  const [error, setError] = useState<string | null>(null)
  const open = (url: string) =>
    void dugout.preview.openUrl(url).then((result) => setError(result.ok ? null : result.error))

  return (
    <section className={styles.block} aria-label="Preview">
      {deployment && <DeploymentRow deployment={deployment} onOpen={open} />}
      <DevServerRow project={project} checkout={checkout} onOpen={open} />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  )
}

interface DeploymentRowProps {
  readonly deployment: PreviewDeployment
  onOpen(url: string): void
}

function DeploymentRow({ deployment, onOpen }: DeploymentRowProps) {
  const { url } = deployment
  return (
    <div className={styles.row}>
      <Icon icon={Globe} className={styles.glyph} />
      <span className={styles.label} title={`Deployment environment: ${deployment.environment}`}>
        {deployment.environment}
      </span>
      <span className={styles.state} data-state={deployment.state}>
        {STATE_LABEL[deployment.state]}
      </span>
      {url && (
        <button className={styles.button} onClick={() => onOpen(url)} title={url}>
          <Icon icon={ExternalLink} /> Open preview
        </button>
      )}
    </div>
  )
}

interface DevServerRowProps {
  readonly project: Project
  readonly checkout: GitCheckout
  onOpen(url: string): void
}

function DevServerRow({ project, checkout, onOpen }: DevServerRowProps) {
  const dev = useDevServer(project, checkout)
  const setDevCommand = useProjectsStore((state) => state.setDevCommand)
  const [isEditing, setIsEditing] = useState(false)
  const port = dev.pane?.devServer?.port

  if (isEditing) {
    return (
      <DevCommandForm
        initialCommand={project.devCommand ?? ''}
        onSave={async (command) => {
          await setDevCommand(project.id, command)
          setIsEditing(false)
        }}
        onCancel={() => setIsEditing(false)}
      />
    )
  }
  if (!project.devCommand) {
    return (
      <div className={styles.row}>
        <Icon icon={SquareTerminal} className={styles.glyph} />
        <button
          className={styles.linkButton}
          onClick={() => setIsEditing(true)}
          title="A command that starts your app locally, e.g. npm run dev"
        >
          Set dev command…
        </button>
      </div>
    )
  }
  return (
    <>
      <div className={styles.row}>
        <Icon icon={SquareTerminal} className={styles.glyph} />
        {port !== undefined ? (
          <span className={styles.label} title="Dev server">
            localhost:{port}
          </span>
        ) : (
          <code className={styles.command} title={project.devCommand}>
            {project.devCommand}
          </code>
        )}
        <button
          className={styles.iconButton}
          onClick={() => setIsEditing(true)}
          aria-label="Edit dev command"
          title="Edit dev command"
        >
          <Icon icon={Pencil} />
        </button>
        {port !== undefined ? (
          <>
            <button className={styles.button} onClick={dev.show} title="Show its shell">
              Show
            </button>
            <button
              className={styles.button}
              onClick={() => onOpen(devServerUrl(port))}
              title={devServerUrl(port)}
              aria-label="Open dev server"
            >
              <Icon icon={ExternalLink} /> Open
            </button>
          </>
        ) : (
          <button
            className={styles.button}
            onClick={() => void dev.run()}
            disabled={dev.isStarting}
            title="Start it in a new shell in this checkout, with a free PORT"
            aria-label="Run dev server"
          >
            <Icon icon={Play} /> Run
          </button>
        )}
      </div>
      {dev.error && (
        <p className={styles.error} role="alert">
          {dev.error}
        </p>
      )}
    </>
  )
}
