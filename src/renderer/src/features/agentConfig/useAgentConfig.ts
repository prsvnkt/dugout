import { useCallback, useEffect, useState } from 'react'
import type { AgentConfig, McpServer } from '@shared/agentConfig'
import type { ProjectId } from '@shared/project'
import { dugout } from '@renderer/lib/dugout'
import { unwrap } from '@shared/result'

/** Loads a project's agent settings and saves changes, reloading after each one. */
export function useAgentConfig(projectId: ProjectId) {
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const reload = useCallback(async () => {
    const result = await dugout.agentConfig.read(projectId)
    if (result.ok) setConfig(result.data)
    setError(result.ok ? null : result.error)
  }, [projectId])

  useEffect(() => {
    void dugout.agentConfig.read(projectId).then((result) => {
      if (result.ok) setConfig(result.data)
      setError(result.ok ? null : result.error)
    })
  }, [projectId])

  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setIsBusy(true)
    try {
      await action()
      setError(null)
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      return false
    } finally {
      setIsBusy(false)
      await reload()
    }
  }

  const saveServers = (servers: readonly McpServer[]) =>
    run(async () => {
      if (!config?.mcp.ok) throw new Error('.mcp.json could not be read.')
      unwrap(await dugout.agentConfig.saveMcp(projectId, servers, config.mcp.version))
    })

  const linkInstructions = () =>
    run(async () => unwrap(await dugout.agentConfig.linkInstructions(projectId)))

  return { config, error, isBusy, reload, saveServers, linkInstructions }
}
