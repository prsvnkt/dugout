import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'
import { safeLinkUrl } from './safeLink'

const render = (text: string) => renderToStaticMarkup(createElement(Markdown, { text }))

describe('Markdown', () => {
  it('renders headings, lists, code and read-only task checkboxes', () => {
    const html = render('## Steps\n\n- one\n- [x] done\n\n`code`')
    expect(html).toContain('<h2>Steps</h2>')
    expect(html).toContain('<li>one</li>')
    const checkbox = /<input type="checkbox"[^>]*>/.exec(html)?.[0] ?? ''
    expect(checkbox).toContain('checked=""')
    expect(checkbox).toContain('disabled=""')
    expect(html).toContain('<code>code</code>')
  })

  it('drops raw HTML, including script tags', () => {
    const html = render('Hi <script>alert(1)</script>\n\n<img src=x onerror="alert(1)">')
    expect(html).not.toMatch(/<script|onerror|<img/i)
  })

  it('neutralises javascript: links', () => {
    const html = render('[click](javascript:alert(1)) and <javascript:alert(2)>')
    expect(html).not.toMatch(/href="javascript:/i)
    expect(html).not.toContain('<a')
    expect(html).toContain('click')
  })

  it('opens https links in the browser', () => {
    const html = render('[docs](https://example.com/a)')
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('target="_blank"')
  })

  it('shows images as links instead of loading them', () => {
    const html = render('![screenshot](https://example.com/s.png)')
    expect(html).not.toContain('<img')
    expect(html).toContain('>screenshot</a>')
  })
})

describe('safeLinkUrl', () => {
  it('allows only https URLs', () => {
    expect(safeLinkUrl('https://github.com/o/r')).toBe('https://github.com/o/r')
    expect(safeLinkUrl('http://example.com')).toBeNull()
    expect(safeLinkUrl('JavaScript:alert(1)')).toBeNull()
    expect(safeLinkUrl('file:///etc/passwd')).toBeNull()
    expect(safeLinkUrl('/relative')).toBeNull()
    expect(safeLinkUrl(undefined)).toBeNull()
  })
})
