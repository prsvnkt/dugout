import { MAX_CHECK_OUTPUT_LENGTH } from '@shared/checks'

/** Raw output kept while a check runs; generous, since colour codes are removed only at the end. */
const MAX_RAW_OUTPUT_LENGTH = MAX_CHECK_OUTPUT_LENGTH * 4

// CSI sequences (colours, cursor moves) and OSC sequences (titles, links).
// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)?/g

/** Appends a chunk, keeping only the end once the output grows past the raw limit. */
export function appendOutput(output: string, chunk: string): string {
  const next = output + chunk
  return next.length > MAX_RAW_OUTPUT_LENGTH ? next.slice(-MAX_RAW_OUTPUT_LENGTH) : next
}

/** The end of a check's output as plain text: no colour codes, `\n` line ends, trimmed. */
export function outputTail(output: string): string {
  const plain = output.replace(ANSI_PATTERN, '').replace(/\r\n?/g, '\n').trim()
  return plain.length > MAX_CHECK_OUTPUT_LENGTH ? plain.slice(-MAX_CHECK_OUTPUT_LENGTH) : plain
}
