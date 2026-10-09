import { useEffect, useState, type FormEvent } from 'react'
import type { LinearState } from '@shared/linear'
import { useLinearStore } from '@renderer/features/linear/linearStore'
import styles from './TaskSource.module.css'
import tasksStyles from './Tasks.module.css'

const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Pasting a personal API key; main checks it with Linear and keeps it encrypted. */
function ApiKeyForm({ onError }: { onError(message: string | null): void }) {
  const connect = useLinearStore((state) => state.connect)
  const [apiKey, setApiKey] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setIsBusy(true)
    onError(null)
    connect(apiKey.trim())
      .catch((error: unknown) => onError(message(error)))
      .finally(() => setIsBusy(false))
  }
  return (
    <form className={styles.row} onSubmit={submit} aria-label="Connect Linear">
      <input
        className={tasksStyles.input}
        type="password"
        value={apiKey}
        onChange={(event) => setApiKey(event.target.value)}
        placeholder="lin_api_…"
        aria-label="Linear API key"
        autoComplete="off"
        spellCheck={false}
      />
      <button type="submit" className={tasksStyles.primary} disabled={!apiKey.trim() || isBusy}>
        Connect
      </button>
    </form>
  )
}

interface LinearConnectProps {
  readonly state: LinearState | null
  readonly teamKey: string
  onTeamChange(teamKey: string): void
}

/** Linear's part of the task source form: connect with an API key, then pick a team. */
export function LinearConnect({ state, teamKey, onTeamChange }: LinearConnectProps) {
  const { teams, loadTeams, disconnect } = useLinearStore()
  const [error, setError] = useState<string | null>(null)
  const isConnected = state?.status === 'connected'

  useEffect(() => {
    if (!isConnected) return
    loadTeams().catch((cause: unknown) => setError(message(cause)))
  }, [isConnected, loadTeams])

  useEffect(() => {
    const first = teams?.[0]
    if (first && !teams.some((team) => team.key === teamKey)) onTeamChange(first.key)
  }, [teams, teamKey, onTeamChange])

  return (
    <div className={styles.linear}>
      {state?.status === 'connected' ? (
        <>
          <p className={styles.account}>
            <span>
              Linear: <strong>{state.account.name}</strong> · {state.account.organization}
            </span>
            <button
              type="button"
              className={styles.link}
              onClick={() => void disconnect().catch((cause: unknown) => setError(message(cause)))}
            >
              Disconnect
            </button>
          </p>
          <select
            className={tasksStyles.input}
            aria-label="Linear team"
            value={teamKey}
            onChange={(event) => onTeamChange(event.target.value)}
            disabled={!teams || teams.length === 0}
          >
            {teams === null && <option value="">Loading teams…</option>}
            {teams?.map((team) => (
              <option key={team.key} value={team.key}>
                {team.name} ({team.key})
              </option>
            ))}
          </select>
        </>
      ) : (
        <>
          <p className={styles.hint}>
            Paste a personal API key from Linear (Settings → Security &amp; access). Dugout keeps it
            encrypted on this Mac; agents never see it.
          </p>
          <ApiKeyForm onError={setError} />
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
