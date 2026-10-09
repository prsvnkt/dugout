import { describe, expect, test } from 'vitest'
import type { ContextEntry } from '@shared/context'
import { parseEntry, parseProposal, serializeEntry, serializeProposal } from './contextFormat'

const DATE = '2026-10-09T10:00:00.000Z'

describe('context entry files', () => {
  test.each<ContextEntry>([
    {
      id: 'n',
      scope: 'shared',
      title: 'Deploys',
      body: 'Ship on **Fridays**.\n',
      updatedAt: DATE,
      kind: 'note',
    },
    {
      id: 'f',
      scope: 'shared',
      title: 'Auth',
      body: '',
      updatedAt: DATE,
      kind: 'file',
      path: 'src/auth',
      hash: 'abc',
    },
    {
      id: 'l',
      scope: 'private',
      title: 'Docs: "v2"',
      body: 'see\n',
      updatedAt: DATE,
      kind: 'link',
      url: 'https://example.com/a?b=1',
    },
    {
      id: 'd',
      scope: 'shared',
      title: 'Spec',
      body: '# Spec\n',
      updatedAt: DATE,
      kind: 'doc',
      source: 'spec.md',
    },
    {
      id: 'c',
      scope: 'shared',
      title: 'Codemap',
      body: '- src/\n',
      updatedAt: DATE,
      kind: 'codemap',
      agent: 'claude',
    },
  ])('round-trips a $kind entry', (entry) => {
    // Act
    const parsed = parseEntry(entry.id, entry.scope, serializeEntry(entry), 'other date')

    // Assert
    expect(parsed).toEqual(entry)
  })

  test('writes readable front matter', () => {
    const file = serializeEntry({
      id: 'f',
      scope: 'shared',
      title: 'Auth',
      body: 'Why it matters',
      updatedAt: DATE,
      kind: 'file',
      path: 'src/auth.ts',
      hash: 'abc',
    })
    expect(file).toBe(
      `---\nkind: file\ntitle: "Auth"\npath: "src/auth.ts"\nhash: "abc"\nupdated: "${DATE}"\n---\n\nWhy it matters\n`,
    )
  })

  test('reads a plain markdown file as a note titled by its first heading', () => {
    const entry = parseEntry('setup', 'shared', 'Intro\n\n## Local setup\nRun it.\n', DATE)
    expect(entry).toMatchObject({ kind: 'note', title: 'Local setup', updatedAt: DATE })
    expect(entry.body).toBe('Intro\n\n## Local setup\nRun it.\n')
  })

  test('falls back to the id as title, and to a note when fields are broken', () => {
    const entry = parseEntry('x', 'shared', '---\nkind: file\npath: ../etc\n---\nbody', DATE)
    expect(entry).toMatchObject({ kind: 'note', title: 'x', body: 'body' })
  })

  test('refuses links that are not web links', () => {
    const entry = parseEntry(
      'x',
      'shared',
      '---\nkind: link\nurl: "javascript:alert(1)"\n---\n',
      DATE,
    )
    expect(entry.kind).toBe('note')
  })
})

describe('proposal files', () => {
  test('round-trip with the agent that proposed them', () => {
    const proposal = {
      id: 'p',
      title: 'Tests need Docker',
      body: 'Start Docker first.',
      proposedBy: 'codex' as const,
      createdAt: DATE,
    }
    expect(parseProposal('p', serializeProposal(proposal), 'other')).toEqual(proposal)
  })
})
