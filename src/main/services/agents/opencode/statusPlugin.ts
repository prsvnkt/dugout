/**
 * The OpenCode plugin Dugout writes to `<userData>/opencode-status.mjs` and loads into every
 * OpenCode terminal through `OPENCODE_CONFIG_CONTENT`. It turns OpenCode's own events into
 * Dugout's status signals, shaped like Claude Code hook payloads so the hook server, pending
 * approvals and the inbox treat every agent the same. The mapping mirrors OpenCode's built-in
 * notifications (busy → idle is "done", `permission.asked` and `question.asked` need you).
 * It reads the terminal from the environment, does nothing outside Dugout, never throws, and
 * sends signals one at a time (so they arrive in order) with a short timeout.
 */
export const OPENCODE_STATUS_PLUGIN = String.raw`// Written by Dugout: reports this OpenCode session's status to the Dugout terminal it runs in.
const TIMEOUT_MS = 2000
const QUESTION = 'OpenCode has a question'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Permission metadata as a tool input: OpenCode names the edited file "filepath". */
function toolInput(request) {
  const metadata = isObject(request.metadata) ? request.metadata : {}
  return typeof metadata.filepath === 'string' ? { ...metadata, file_path: metadata.filepath } : metadata
}

export const DugoutStatus = async () => {
  const { DUGOUT_TERMINAL_ID: terminalId, DUGOUT_HOOK_SOCKET: socket, DUGOUT_HOOK_TOKEN: token } =
    process.env
  if (!terminalId || !socket || !token) return {}

  let queue = Promise.resolve()
  const send = (signal, payload) => {
    queue = queue
      .then(() =>
        fetch('http://dugout/hooks/' + terminalId + '/' + signal, {
          method: 'POST',
          unix: socket,
          headers: { Authorization: 'Bearer ' + token },
          body: payload ? JSON.stringify(payload) : '',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        }),
      )
      .then(
        () => undefined,
        () => undefined,
      )
  }

  /** Subagent sessions (the task tool): their turns are not the agent's. */
  const subagentSessions = new Set()
  const busySessions = new Set()
  /** Permission requests waiting for a reply, by request id. */
  const askedTools = new Map()

  send('ready')
  return {
    event: async ({ event }) => {
      const properties = isObject(event?.properties) ? event.properties : {}
      const sessionId = properties.sessionID
      switch (event?.type) {
        case 'session.created':
          if (properties.info?.parentID) subagentSessions.add(properties.info.id)
          return
        case 'session.status': {
          if (subagentSessions.has(sessionId)) return
          const type = properties.status?.type
          if ((type === 'busy' || type === 'retry') && !busySessions.has(sessionId)) {
            busySessions.add(sessionId)
            send('working', { session_id: sessionId })
          } else if (type === 'idle' && busySessions.delete(sessionId)) {
            send('done', { hook_event_name: 'Stop', session_id: sessionId })
          }
          return
        }
        case 'permission.asked': {
          const tool = {
            tool_name: properties.permission,
            tool_use_id: properties.tool?.callID ?? properties.id,
            tool_input: toolInput(properties),
          }
          askedTools.set(properties.id, tool)
          send('needs-input', { hook_event_name: 'PermissionRequest', session_id: sessionId, ...tool })
          return
        }
        case 'permission.replied': {
          const tool = askedTools.get(properties.requestID)
          if (!tool) return
          askedTools.delete(properties.requestID)
          send('tool-done', { hook_event_name: 'PostToolUse', session_id: sessionId, ...tool })
          return
        }
        case 'question.asked':
          send('needs-input', { hook_event_name: 'Notification', session_id: sessionId, message: QUESTION })
          return
        case 'question.replied':
        case 'question.rejected':
          send('tool-done', { session_id: sessionId })
          return
      }
    },
    'tool.execute.after': async (input) => {
      send('tool-done', {
        hook_event_name: 'PostToolUse',
        session_id: input?.sessionID,
        tool_name: input?.tool,
        tool_use_id: input?.callID,
        tool_input: input?.args,
      })
    },
  }
}
`
