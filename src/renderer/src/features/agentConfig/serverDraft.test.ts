import { describe, expect, test } from 'vitest'
import { draftFromServer, EMPTY_DRAFT, serverFromDraft } from './serverDraft'

describe('server drafts', () => {
  test('round-trips a stdio server through the form fields', () => {
    const server = {
      name: 'github',
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'server-github'],
      env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
    } as const
    const draft = draftFromServer(server)
    expect(draft.args).toBe('-y\nserver-github')
    expect(draft.pairs).toBe('GITHUB_TOKEN=${GITHUB_TOKEN}')
    expect(serverFromDraft(draft, [])).toEqual({ ok: true, server })
  })

  test('reads headers as "Name: value" lines for remote servers', () => {
    const draft = {
      ...EMPTY_DRAFT,
      name: 'docs',
      type: 'http' as const,
      url: 'https://d.dev/mcp',
      pairs: 'Authorization: Bearer ${T}\n\n',
    }
    expect(serverFromDraft(draft, [])).toEqual({
      ok: true,
      server: {
        name: 'docs',
        type: 'http',
        url: 'https://d.dev/mcp',
        headers: { Authorization: 'Bearer ${T}' },
      },
    })
  })

  test('explains what is missing or clashing', () => {
    expect(serverFromDraft({ ...EMPTY_DRAFT, command: 'x' }, [])).toEqual({
      ok: false,
      error: 'Give the server a name.',
    })
    expect(serverFromDraft({ ...EMPTY_DRAFT, name: 'a', command: 'x' }, ['a'])).toEqual({
      ok: false,
      error: 'A server named "a" already exists.',
    })
    expect(
      serverFromDraft({ ...EMPTY_DRAFT, name: 'a', command: 'x', pairs: 'novalue' }, []),
    ).toEqual({
      ok: false,
      error: 'Write each variable as NAME=value ("novalue").',
    })
  })
})
