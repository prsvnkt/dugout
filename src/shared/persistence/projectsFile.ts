import { z } from 'zod'
import { absolutePath, projectId, serversHash } from '../ipc/fields'
import {
  checkCommand,
  devCommand,
  maxAgents,
  projectColor,
  projectName,
  queuedTaskSchema,
  taskSourceSchema,
  worktreeSetupSchema,
} from '../ipc/projectContract'
import { MAX_QUEUED_TASKS } from '../taskQueue'

/** Optional fields, so projects.json files from before decisions 047, 051 and 052 still load. */
const projectSchema = z.object({
  id: projectId,
  name: projectName,
  rootPath: absolutePath,
  color: projectColor,
  createdAt: z.iso.datetime(),
  devCommand: devCommand.min(1).optional(),
  checkCommand: checkCommand.optional(),
  worktreeSetup: worktreeSetupSchema.optional(),
  taskSource: taskSourceSchema.optional(),
  maxAgents: maxAgents.optional(),
  taskQueue: z.array(queuedTaskSchema).max(MAX_QUEUED_TASKS).optional(),
  approvedMcpServers: serversHash.optional(),
})

/** On-disk format of projects.json. Bump `version` and migrate when it changes. */
export const projectsFileSchema = z.object({
  version: z.literal(1),
  projects: z.array(projectSchema),
})
