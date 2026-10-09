import { CONTEXT_ID_PATTERN } from '@shared/context'

const MAX_SLUG_LENGTH = 60
const FALLBACK_SLUG = 'note'

/** The entry id of a file in a context folder, or null if it is not an entry file. */
export function idFromFileName(name: string): string | null {
  if (!name.endsWith('.md')) return null
  const id = name.slice(0, -'.md'.length)
  return CONTEXT_ID_PATTERN.test(id) ? id : null
}

/** "Deploys & releases!" → "deploys-releases". */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/^-+|-+$/g, '')
  return slug || FALLBACK_SLUG
}

/** The title's slug, with "-2", "-3", … added until it is not taken. */
export function uniqueId(title: string, taken: ReadonlySet<string | null>): string {
  const slug = slugify(title)
  if (!taken.has(slug)) return slug
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`
    if (!taken.has(candidate)) return candidate
  }
}
