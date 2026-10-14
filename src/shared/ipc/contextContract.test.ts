import { describe, expect, test } from 'vitest'
import { MAX_CONTEXT_URL_LENGTH } from '../context'
import { contextEntryInputSchema, contextUrl } from './contextContract'
import { repoRelativePath } from './fields'

describe('contextUrl', () => {
  test.each(['https://example.com/docs', 'http://localhost:3000/a?b=c#d', 'HTTPS://EXAMPLE.COM'])(
    'accepts the web link %s',
    (url) => {
      expect(contextUrl.safeParse(url).success).toBe(true)
    },
  )

  test.each([
    'javascript:alert(1)',
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com/file',
    'vscode://open?file=/etc/passwd',
    'httpx://example.com',
    'example.com',
    '/relative/path',
    '',
  ])('rejects %j, which is not an http(s) link', (url) => {
    expect(contextUrl.safeParse(url).success).toBe(false)
  })

  test('rejects a link longer than the limit', () => {
    const base = 'https://example.com/'
    const atLimit = base + 'a'.repeat(MAX_CONTEXT_URL_LENGTH - base.length)

    expect(contextUrl.safeParse(atLimit).success).toBe(true)
    expect(contextUrl.safeParse(`${atLimit}a`).success).toBe(false)
  })

  test('is what a link entry is checked with', () => {
    const entry = { kind: 'link', scope: 'shared', title: 'Docs', body: '' }

    expect(contextEntryInputSchema.safeParse({ ...entry, url: 'https://x.dev' }).success).toBe(true)
    expect(contextEntryInputSchema.safeParse({ ...entry, url: 'file:///x' }).success).toBe(false)
  })
})

describe('repoRelativePath', () => {
  test.each(['README.md', 'src/a.ts', '.github/workflows/ci.yml', 'a..b/c', '..hidden', 'dir/'])(
    'accepts the path inside the repository %j',
    (path) => {
      expect(repoRelativePath.safeParse(path).success).toBe(true)
    },
  )

  test.each([
    ['empty', ''],
    ['absolute', '/etc/passwd'],
    ['a parent folder', '..'],
    ['a leading parent segment', '../outside'],
    ['a parent segment in the middle', 'src/../../outside'],
    ['a trailing parent segment', 'src/..'],
    ['a NUL byte', 'src/a.ts\0.png'],
    ['too long', 'a'.repeat(4097)],
  ])('rejects %s', (_label, path) => {
    expect(repoRelativePath.safeParse(path).success).toBe(false)
  })

  test('is what a file entry is checked with', () => {
    const entry = { kind: 'file', scope: 'shared', title: 'Spec', body: '' }

    expect(contextEntryInputSchema.safeParse({ ...entry, path: 'docs/a.md' }).success).toBe(true)
    expect(contextEntryInputSchema.safeParse({ ...entry, path: '../a.md' }).success).toBe(false)
  })
})
