/** One text replacement in a file: what was there and what replaces it ("" for a new file). */
export interface TextChange {
  readonly before: string
  readonly after: string
}

/** A named argument of a tool call we have no special view for, e.g. `url` or `query`. */
export interface ToolField {
  readonly name: string
  readonly value: string
}

/**
 * A tool call an agent is waiting to have approved, in full, for the inbox. Long texts are
 * clipped in main (they say so at the end), so a preview is always small enough to send.
 */
export type ToolCallPreview =
  | {
      readonly kind: 'command'
      readonly tool: string
      readonly command: string
      /** The agent's own one-line description of the command, when it gave one. */
      readonly description: string | null
    }
  | {
      readonly kind: 'edit'
      readonly tool: string
      readonly filePath: string
      readonly changes: readonly TextChange[]
    }
  | { readonly kind: 'other'; readonly tool: string; readonly fields: readonly ToolField[] }
