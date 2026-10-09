import { Check, Plus } from 'lucide-react'
import type { CodexSharing, McpServer } from '@shared/agentConfig'
import { MCP_PRESETS, type McpPreset } from '@shared/mcpPresets'
import { Icon } from '@renderer/lib/Icon'
import { sharingText } from './sharingText'
import styles from './AgentSettings.module.css'

interface PresetListProps {
  /** Names already in .mcp.json; their presets show as added. */
  readonly takenNames: readonly string[]
  readonly presetCodex: Readonly<Record<string, CodexSharing>>
  readonly isBusy: boolean
  onAdd(server: McpServer): void
}

function PresetRow(props: {
  preset: McpPreset
  sharing: CodexSharing | undefined
  isAdded: boolean
  isBusy: boolean
  onAdd(): void
}) {
  const { preset, isAdded } = props
  return (
    <li className={styles.server} aria-label={`MCP preset ${preset.label}`}>
      <div className={styles.serverMain}>
        <span className={styles.serverName}>{preset.label}</span>
        <span className={styles.badge}>{preset.server.type}</span>
        <span className={styles.description}>{preset.description}</span>
      </div>
      <p className={styles.sharing}>
        {preset.setup} · {sharingText(props.sharing)}
      </p>
      <div className={styles.rowActions}>
        <button
          className={styles.iconButton}
          onClick={props.onAdd}
          disabled={isAdded || props.isBusy}
          aria-label={`Add ${preset.label}`}
        >
          <Icon icon={isAdded ? Check : Plus} />
          {isAdded ? 'Added' : 'Add'}
        </button>
      </div>
    </li>
  )
}

/** Common MCP servers added to .mcp.json in one click, secrets as ${VAR} references. */
export function PresetList({ takenNames, presetCodex, isBusy, onAdd }: PresetListProps) {
  return (
    <section className={styles.presets} aria-labelledby="agent-settings-presets">
      <h3 id="agent-settings-presets">Presets</h3>
      <ul className={styles.servers}>
        {MCP_PRESETS.map((preset) => (
          <PresetRow
            key={preset.server.name}
            preset={preset}
            sharing={presetCodex[preset.server.name]}
            isAdded={takenNames.includes(preset.server.name)}
            isBusy={isBusy}
            onAdd={() => onAdd(preset.server)}
          />
        ))}
      </ul>
    </section>
  )
}
