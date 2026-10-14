import { z } from 'zod'
import { projectId, serversHash } from './fields'

/** Schemas for Agent settings: a project's `.mcp.json` servers and their approval (decision 057). */

const mcpRecord = z.record(z.string().min(1).max(256), z.string().max(4096))
const mcpServerName = z.string().min(1).max(128)
export const mcpServerSchema = z.discriminatedUnion('type', [
  z.object({
    name: mcpServerName,
    type: z.literal('stdio'),
    command: z.string().trim().min(1).max(4096),
    args: z.array(z.string().max(4096)).max(100),
    env: mcpRecord,
  }),
  z.object({
    name: mcpServerName,
    type: z.enum(['http', 'sse']),
    url: z
      .string()
      .max(4096)
      .refine(
        (value) => /^https?:\/\//.test(value) || value.startsWith('${'),
        'Use an http(s) URL.',
      ),
    headers: mcpRecord,
  }),
])
export const agentConfigRequestSchema = z.object({ projectId })
/** Approves the servers the user saw (by their hash), or forgets the approval with null. */
export const agentConfigApproveServersRequestSchema = z.object({
  projectId,
  hash: serversHash.nullable(),
})
export const agentConfigSaveMcpRequestSchema = z.object({
  projectId,
  version: z.string().max(128),
  servers: z
    .array(mcpServerSchema)
    .max(100)
    .refine(
      (servers) => new Set(servers.map((s) => s.name)).size === servers.length,
      'Server names must be unique.',
    ),
})
