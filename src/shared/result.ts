/** Envelope for every request-response IPC call, so failures carry a user-facing message. */
export type Result<T> =
  { readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const fail = <T = never>(error: string): Result<T> => ({ ok: false, error })

/** Returns the data or throws an Error carrying the user-facing message. */
export function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}
