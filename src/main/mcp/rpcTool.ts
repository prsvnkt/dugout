/** Calls Dugout's main process; it resolves the project from the terminal the agent runs in. */
export type DugoutRpc = (method: string, params: Record<string, unknown>) => Promise<unknown>

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean }

/** Forwards a tool call to Dugout; its answer becomes compact JSON, its error a tool error. */
export async function run(
  rpc: DugoutRpc,
  method: string,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  try {
    const result = await rpc(method, params)
    return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }) }] }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { content: [{ type: 'text', text: message }], isError: true }
  }
}
