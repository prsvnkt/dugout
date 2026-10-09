/**
 * Verify on Stop (decision 042): when an agent finishes a turn, Dugout runs the project's check
 * command (e.g. `npm run check`) in that agent's checkout and shows whether it passed.
 */
export type CheckStatus =
  /** No check has run since the agent's last turn, or the project has no check command. */
  | { readonly state: 'idle' }
  | { readonly state: 'running'; readonly command: string }
  | { readonly state: 'passed'; readonly command: string; readonly durationMs: number }
  /** `exitCode` is null when the check was stopped (timed out) rather than exiting. */
  | {
      readonly state: 'failed'
      readonly command: string
      readonly exitCode: number | null
      /** The end of what the command printed, without colour codes. */
      readonly output: string
    }

export const CHECK_IDLE: CheckStatus = { state: 'idle' }

export const MAX_CHECK_COMMAND_LENGTH = 500

/** How much of a failed check's output is kept and sent back to the agent. */
export const MAX_CHECK_OUTPUT_LENGTH = 6_000
