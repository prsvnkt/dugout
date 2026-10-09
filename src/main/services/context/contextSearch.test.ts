import { describe, expect, test } from 'vitest'
import type { ContextEntryView } from '@shared/context'
import { indexItem, MAX_SEARCH_HITS, searchContext } from './contextSearch'

const base = { scope: 'shared' as const, updatedAt: '2026-10-09T00:00:00.000Z' }
const DEPLOYS: ContextEntryView = {
  ...base,
  id: 'deploys',
  kind: 'note',
  title: 'Deploys',
  body: 'We deploy with Fly on Fridays.',
}
const AUTH: ContextEntryView = {
  ...base,
  id: 'auth',
  kind: 'file',
  title: 'Auth module',
  body: 'Sessions live in Redis.',
  path: 'src/auth',
  hash: 'h',
  pin: 'stale',
}
const ENTRIES: ContextEntryView[] = [
  DEPLOYS,
  AUTH,
  { ...base, id: 'api', kind: 'link', title: 'API docs', body: '', url: 'https://api.example.com' },
]

describe('indexItem', () => {
  test('keeps only what helps an agent choose: no body, no hash', () => {
    expect(indexItem(AUTH)).toEqual({
      id: 'auth',
      kind: 'file',
      title: 'Auth module',
      scope: 'shared',
      path: 'src/auth',
      pin: 'stale',
    })
  })

  test('leaves out a pin that is current', () => {
    expect(indexItem({ ...AUTH, pin: 'current' })).not.toHaveProperty('pin')
  })
})

describe('searchContext', () => {
  test('matches every word in any case, across title, path, link and body', () => {
    expect(searchContext(ENTRIES, 'REDIS sessions').map((hit) => hit.id)).toEqual(['auth'])
    expect(searchContext(ENTRIES, 'src/auth').map((hit) => hit.id)).toEqual(['auth'])
    expect(searchContext(ENTRIES, 'api.example').map((hit) => hit.id)).toEqual(['api'])
    expect(searchContext(ENTRIES, 'deploy redis')).toEqual([])
  })

  test('shows a snippet around the match in the body', () => {
    const [hit] = searchContext(ENTRIES, 'fly')
    expect(hit?.snippet).toBe('We deploy with Fly on Fridays.')
  })

  test('cuts long snippets and caps the number of hits', () => {
    const long = { ...DEPLOYS, body: `${'a '.repeat(200)}needle${' b'.repeat(200)}` }
    const many = Array.from({ length: 30 }, (_, i) => ({ ...long, id: `n${i}` }))

    const hits = searchContext(many, 'needle')

    expect(hits).toHaveLength(MAX_SEARCH_HITS)
    expect(hits[0]?.snippet).toMatch(/^….*needle.*…$/)
  })
})
