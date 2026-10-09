import { useState } from 'react'
import type { AgentKind } from '@shared/agents'
import type { ContextEntryInput, ContextScope } from '@shared/context'
import type { ProjectId } from '@shared/project'
import { unwrap } from '@shared/result'
import { dugout } from '@renderer/lib/dugout'
import { useContextStore } from './contextStore'

/** The Context tab's changes: each one reloads the project's context and reports its error. */
export function useContextActions(projectId: ProjectId) {
  const refresh = useContextStore((state) => state.refresh)
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isBuilding, setIsBuilding] = useState(false)

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
      await refresh(projectId)
    }
  }

  return {
    error,
    isBusy,
    isBuilding,
    add: (entry: ContextEntryInput) =>
      run(async () => unwrap(await dugout.context.add(projectId, entry))),
    edit: (id: string, title: string, body: string) =>
      run(async () => unwrap(await dugout.context.edit(projectId, { id, title, body }))),
    remove: (id: string) =>
      void run(async () => unwrap(await dugout.context.remove(projectId, id))),
    repin: (id: string) => void run(async () => unwrap(await dugout.context.repin(projectId, id))),
    approve: (id: string) =>
      void run(async () => unwrap(await dugout.context.approve(projectId, id))),
    discard: (id: string) =>
      void run(async () => unwrap(await dugout.context.discard(projectId, id))),
    importDoc: (scope: ContextScope) =>
      void run(async () => unwrap(await dugout.context.importDoc(projectId, scope))),
    async buildCodemap(agent: AgentKind) {
      setIsBuilding(true)
      await run(async () => unwrap(await dugout.context.buildCodemap(projectId, agent)))
      setIsBuilding(false)
    },
  }
}
