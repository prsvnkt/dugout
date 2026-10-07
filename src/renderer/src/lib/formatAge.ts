const JUST_NOW_SECONDS = 45

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

/** "8 minutes ago", "yesterday", "2 years ago" for an ISO date. */
export function formatAge(isoDate: string, now: number = Date.now()): string {
  const time = Date.parse(isoDate)
  if (Number.isNaN(time)) return ''
  const seconds = Math.round((now - time) / 1000)
  if (seconds < JUST_NOW_SECONDS) return 'just now'
  const [unit, size] = UNITS.find(([, unitSeconds]) => seconds >= unitSeconds) ?? ['minute', 60]
  return relative.format(-Math.round(seconds / size), unit)
}
