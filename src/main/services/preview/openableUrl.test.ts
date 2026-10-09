import { describe, expect, test } from 'vitest'
import { KnownPreviewUrls, openablePreviewUrl } from './openableUrl'

function knownWith(...urls: string[]): KnownPreviewUrls {
  const known = new KnownPreviewUrls()
  urls.forEach((url) => known.remember(url))
  return known
}

describe('openablePreviewUrl', () => {
  test('opens a preview URL main reported', () => {
    const known = knownWith('https://app-git-feat.vercel.app/')

    expect(openablePreviewUrl('https://app-git-feat.vercel.app', known)).toBe(
      'https://app-git-feat.vercel.app/',
    )
  })

  test('opens a local dev server on an assignable port', () => {
    expect(openablePreviewUrl('http://localhost:4100', knownWith())).toBe('http://localhost:4100/')
  })

  test.each([
    ['an unknown remote site', 'https://evil.example.com/'],
    ['a file URL', 'file:///etc/passwd'],
    ['a javascript URL', 'javascript:alert(1)'],
    ['credentials in the URL', 'http://user:pw@localhost:4100/'],
    ['a privileged local port', 'http://localhost:80/'],
    ['a local path beyond the root', 'http://localhost:4100/admin'],
    ['a local query', 'http://localhost:4100/?x=1'],
    ['https on localhost', 'https://localhost:4100/'],
    ['another local host name', 'http://127.0.0.1:4100/'],
    ['not a URL', 'nonsense'],
  ])('refuses %s', (_label, url) => {
    expect(openablePreviewUrl(url, knownWith())).toBeNull()
  })
})

describe('KnownPreviewUrls', () => {
  test('forgets the oldest URLs beyond its limit', () => {
    const known = new KnownPreviewUrls()
    const urls = Array.from({ length: 51 }, (_, index) => `https://p${index}.example.dev/`)

    urls.forEach((url) => known.remember(url))

    expect(known.has(urls[0] ?? '')).toBe(false)
    expect(known.has(urls[50] ?? '')).toBe(true)
  })

  test('keeps a URL remembered again as the newest', () => {
    const known = new KnownPreviewUrls()
    known.remember('https://a.example.dev/')
    Array.from({ length: 49 }, (_, index) => known.remember(`https://p${index}.example.dev/`))

    known.remember('https://a.example.dev/')
    known.remember('https://late.example.dev/')

    expect(known.has('https://a.example.dev/')).toBe(true)
  })
})
