import { useState } from 'react'
import type { CodexSharing, McpServer } from '@shared/agentConfig'
import type { ProjectId } from '@shared/project'
import { useEditorStore } from '@renderer/features/editor/editorStore'
import { PresetList } from './PresetList'
import { sharingText } from './sharingText'
import { draftFromServer, EMPTY_DRAFT } from './serverDraft'
import { ServerForm } from './ServerForm'
import { useAgentConfig } from './useAgentConfig'
import styles from './AgentSettings.module.css'

interface AgentSettingsViewProps {
  readonly projectId: ProjectId
}

/** `null` while browsing; the server's name when editing it; `''` when adding one. */
type Editing = string | null

function summary(server: McpServer): string {
  return server.type === 'stdio' ? [server.command, ...server.args].join(' ') : server.url
}

function ServerRow(props: {
  server: McpServer
  sharing: CodexSharing | undefined
  isBusy: boolean
  onEdit(): void
  onRemove(): void
}) {
  const [isConfirming, setIsConfirming] = useState(false)
  const { server, sharing } = props
  return (
    <li className={styles.server} aria-label={`MCP server ${server.name}`}>
      <div className={styles.serverMain}>
        <span className={styles.serverName}>{server.name}</span>
        <span className={styles.badge}>{server.type}</span>
        <code className={styles.summary}>{summary(server)}</code>
      </div>
      <p
        className={styles.sharing}
        title={sharing?.isShared === false ? sharing.reason : undefined}
      >
        {sharingText(sharing)}
      </p>
      <div className={styles.rowActions}>
        <button onClick={props.onEdit} disabled={props.isBusy} aria-label={`Edit ${server.name}`}>
          Edit
        </button>
        {isConfirming ? (
          <button className={styles.danger} onClick={props.onRemove} disabled={props.isBusy}>
            Confirm remove
          </button>
        ) : (
          <button onClick={() => setIsConfirming(true)} aria-label={`Remove ${server.name}`}>
            Remove
          </button>
        )}
      </div>
    </li>
  )
}

type AgentConfigState = ReturnType<typeof useAgentConfig>

interface SectionProps {
  readonly projectId: ProjectId
  readonly agent: AgentConfigState
}

function McpSection({ projectId, agent }: SectionProps) {
  const { config, error, isBusy, reload, saveServers } = agent
  const openFile = useEditorStore((state) => state.openFile)
  const [editing, setEditing] = useState<Editing>(null)
  if (!config) return <p className={styles.muted}>{error ?? 'Loading…'}</p>
  if (!config.mcp.ok) {
    return (
      <div className={styles.error} role="alert">
        {config.mcp.error}{' '}
        <button onClick={() => openFile(projectId, null, '.mcp.json', false)}>
          Open .mcp.json
        </button>{' '}
        <button onClick={() => void reload()}>Reload</button>
      </div>
    )
  }
  const { servers, codex } = config.mcp
  const save = (next: readonly McpServer[]) =>
    void saveServers(next).then((isSaved) => {
      if (isSaved) setEditing(null)
    })
  const editingServer = servers.find((server) => server.name === editing)

  return (
    <>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {servers.length === 0 && editing === null && (
        <p className={styles.muted}>
          No project MCP servers yet. They are saved to .mcp.json in the repo.
        </p>
      )}
      <ul className={styles.servers}>
        {servers.map((server) =>
          server.name === editing ? null : (
            <ServerRow
              key={server.name}
              server={server}
              sharing={codex[server.name]}
              isBusy={isBusy}
              onEdit={() => setEditing(server.name)}
              onRemove={() => save(servers.filter((other) => other !== server))}
            />
          ),
        )}
      </ul>
      {editing !== null ? (
        <ServerForm
          key={editing}
          initial={editingServer ? draftFromServer(editingServer) : EMPTY_DRAFT}
          takenNames={servers.map((server) => server.name).filter((name) => name !== editing)}
          isBusy={isBusy}
          onCancel={() => setEditing(null)}
          onSave={(server) =>
            save(
              editingServer
                ? servers.map((other) => (other === editingServer ? server : other))
                : [...servers, server],
            )
          }
        />
      ) : (
        <div className={styles.formActions}>
          <button className={styles.primary} onClick={() => setEditing('')}>
            Add server
          </button>
          <button onClick={() => openFile(projectId, null, '.mcp.json', false)}>
            Open .mcp.json
          </button>
        </div>
      )}
      {editing === null && (
        <PresetList
          takenNames={servers.map((server) => server.name)}
          presetCodex={config.presetCodex}
          isBusy={isBusy}
          onAdd={(server) => save([...servers, server])}
        />
      )}
    </>
  )
}

function InstructionsSection({ projectId, agent }: SectionProps) {
  const { config, isBusy, linkInstructions } = agent
  const openFile = useEditorStore((state) => state.openFile)
  if (!config) return null
  const { hasAgentsMd, claudeMdPath, importsAgentsMd } = config.instructions
  return (
    <>
      {importsAgentsMd ? (
        <p className={styles.ok}>
          ✓ {claudeMdPath} imports AGENTS.md, so Claude and Codex follow the same instructions.
        </p>
      ) : (
        <>
          <p className={styles.muted}>
            Codex reads AGENTS.md; Claude reads CLAUDE.md. Make AGENTS.md the single source and have{' '}
            {claudeMdPath ?? 'CLAUDE.md'} import it, keeping a section for Claude-only notes.
            {!hasAgentsMd && claudeMdPath && ` The current ${claudeMdPath} becomes AGENTS.md.`}
          </p>
          <div className={styles.formActions}>
            <button
              className={styles.primary}
              disabled={isBusy}
              onClick={() => void linkInstructions()}
            >
              Make AGENTS.md the source
            </button>
          </div>
        </>
      )}
      <div className={styles.formActions}>
        {hasAgentsMd && (
          <button onClick={() => openFile(projectId, null, 'AGENTS.md', false)}>
            Open AGENTS.md
          </button>
        )}
        {claudeMdPath && (
          <button onClick={() => openFile(projectId, null, claudeMdPath, false)}>
            Open {claudeMdPath}
          </button>
        )}
      </div>
    </>
  )
}

/** Per-project agent setup: MCP servers for Claude and Codex, and the shared instructions. */
export function AgentSettingsView({ projectId }: AgentSettingsViewProps) {
  const agent = useAgentConfig(projectId)
  return (
    <section className={styles.view} aria-label="Agent settings">
      <section className={styles.section} aria-labelledby="agent-settings-mcp">
        <h2 id="agent-settings-mcp">MCP servers</h2>
        <p className={styles.muted}>
          From .mcp.json at the project root. Claude Code loads them itself; Codex agents get the
          ones Codex can run.
        </p>
        <McpSection projectId={projectId} agent={agent} />
      </section>
      <section className={styles.section} aria-labelledby="agent-settings-instructions">
        <h2 id="agent-settings-instructions">Agent instructions</h2>
        <InstructionsSection projectId={projectId} agent={agent} />
      </section>
    </section>
  )
}
