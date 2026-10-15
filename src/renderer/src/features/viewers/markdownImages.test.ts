import { describe, expect, test } from 'vitest'
import { markdownImagePath } from './markdownImages'

describe('markdownImagePath', () => {
  test.each([
    ['img/logo.png', 'docs/guide.md', 'docs/img/logo.png'],
    ['./logo.png', 'README.md', 'logo.png'],
    ['../assets/a b.svg', 'docs/guide.md', 'assets/a b.svg'],
    ['../assets/a%20b.svg', 'docs/guide.md', 'assets/a b.svg'],
    ['/media/shot.jpg', 'docs/deep/guide.md', 'media/shot.jpg'],
    ['shot.png?raw=true#top', 'README.md', 'shot.png'],
  ])('resolves %s from %s to %s', (src, from, expected) => {
    expect(markdownImagePath(src, from)).toBe(expected)
  })

  test.each([
    ['a remote image', 'https://example.com/a.png'],
    ['a protocol-relative URL', '//example.com/a.png'],
    ['a data URL', 'data:image/png;base64,AAAA'],
    ['a file URL', 'file:///etc/a.png'],
    ['a path above the checkout', '../../outside.png'],
    ['a path into .git', '.git/a.png'],
    ['a file that is not an image', 'notes.txt'],
    ['a video', 'clip.mp4'],
    ['an empty link', '  '],
    ['a malformed escape', 'a%E0%A4%A.png'],
    ['the root itself', '/'],
  ])('ignores %s', (_name, src) => {
    expect(markdownImagePath(src, 'docs/guide.md')).toBeNull()
  })
})
