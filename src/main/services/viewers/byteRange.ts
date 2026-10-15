/** The part of a file an HTTP `Range` header asks for (RFC 9110 §14), inclusive bounds. */
export type ByteRange =
  | { readonly kind: 'full' }
  | { readonly kind: 'partial'; readonly start: number; readonly end: number }
  | { readonly kind: 'unsatisfiable' }

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/

/**
 * Parses one `bytes=` range against a file of `size` bytes. A missing, multi-range or
 * malformed header serves the whole file (allowed by the RFC); a range starting past the
 * end is unsatisfiable (416). An end past the file is clamped to its last byte.
 */
export function parseRange(header: string | null, size: number): ByteRange {
  const match = header ? SINGLE_RANGE.exec(header.trim()) : null
  if (!match) return { kind: 'full' }
  const [, first = '', last = ''] = match
  if (first === '' && last === '') return { kind: 'full' }

  if (first === '') {
    // A suffix: the last N bytes.
    const length = Number(last)
    if (length === 0 || size === 0) return { kind: 'unsatisfiable' }
    return { kind: 'partial', start: Math.max(0, size - length), end: size - 1 }
  }
  const start = Number(first)
  const end = last === '' ? size - 1 : Math.min(Number(last), size - 1)
  if (start >= size) return { kind: 'unsatisfiable' }
  if (end < start) return { kind: 'full' }
  return { kind: 'partial', start, end }
}
