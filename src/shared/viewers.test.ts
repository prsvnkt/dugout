import { describe, expect, test } from 'vitest'
import { fileUrl, mediaTypeOf, parseFileUrl, viewerKindOf } from './viewers'

describe('viewerKindOf', () => {
  test.each([
    ['README.md', 'markdown'],
    ['docs/Guide.MARKDOWN', 'markdown'],
    ['logo.png', 'image'],
    ['photo.JPG', 'image'],
    ['icon.svg', 'image'],
    ['favicon.ico', 'image'],
    ['clip.mp4', 'video'],
    ['clip.mov', 'video'],
    ['song.mp3', 'audio'],
    ['paper.pdf', 'pdf'],
  ])('%s opens in the %s viewer', (path, kind) => {
    expect(viewerKindOf(path)).toBe(kind)
  })

  test.each(['src/app.ts', 'Makefile', '.png', 'notes.txt', 'dir.png/file'])(
    '%s stays in the code editor',
    (path) => {
      expect(viewerKindOf(path)).toBeNull()
    },
  )
})

describe('mediaTypeOf', () => {
  test('gives the content type main serves a media file with', () => {
    expect(mediaTypeOf('a/b.svg')).toEqual({ kind: 'image', mime: 'image/svg+xml' })
    expect(mediaTypeOf('b.webm')?.mime).toBe('video/webm')
  })

  test('serves no markdown or other text', () => {
    expect(mediaTypeOf('README.md')).toBeNull()
    expect(mediaTypeOf('.env')).toBeNull()
  })
})

describe('fileUrl and parseFileUrl', () => {
  test('round-trip a path in the main checkout', () => {
    // Arrange
    const checkout = { projectId: 'p1' }

    // Act
    const url = fileUrl(checkout, 'docs/a b#1.png', 1234)

    // Assert
    expect(url).toBe('dugout-file://checkout/docs/a%20b%231.png?project=p1&v=1234')
    expect(parseFileUrl(url)).toEqual({ checkout, path: 'docs/a b#1.png' })
  })

  test('round-trip a path in a worktree', () => {
    const checkout = { projectId: 'p1', worktreePath: '/data/worktrees/p1/abc' }

    const url = fileUrl(checkout, 'clip.mp4')

    expect(url).not.toContain('v=')
    expect(parseFileUrl(url)).toEqual({ checkout, path: 'clip.mp4' })
  })

  test.each([
    ['another scheme', 'file:///etc/passwd'],
    ['another host', 'dugout-file://elsewhere/a.png?project=p1'],
    ['no project', 'dugout-file://checkout/a.png'],
    ['a path escaping the checkout', 'dugout-file://checkout/a/..%2F..%2Fsecret.png?project=p1'],
    ['an encoded absolute path', 'dugout-file://checkout/%2Fetc%2Fhosts?project=p1'],
    ['a path in .git', 'dugout-file://checkout/.git/config?project=p1'],
    ['a relative worktree', 'dugout-file://checkout/a.png?project=p1&worktree=tmp'],
    ['a malformed escape', 'dugout-file://checkout/%E0%A4%A.png?project=p1'],
    ['no path', 'dugout-file://checkout/?project=p1'],
    ['not a URL', 'not a url'],
  ])('reject %s', (_name, url) => {
    expect(parseFileUrl(url)).toBeNull()
  })
})
