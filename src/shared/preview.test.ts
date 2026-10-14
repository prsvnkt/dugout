import { describe, expect, test } from 'vitest'
import { devServerUrl, isOneLineCommand, toWebUrl, urlHost } from './preview'

describe('toWebUrl', () => {
  test.each([
    ['https://app.vercel.app', 'https://app.vercel.app/'],
    ['http://localhost:4100/path?q=1', 'http://localhost:4100/path?q=1'],
  ])('accepts %s', (raw, expected) => {
    expect(toWebUrl(raw)).toBe(expected)
  })

  test.each([
    'javascript:alert(1)',
    'file:///etc/hosts',
    'ftp://x.dev',
    'https://u:p@x.dev',
    '',
    'x',
  ])('refuses %s', (raw) => {
    expect(toWebUrl(raw)).toBeNull()
  })
})

describe('isOneLineCommand', () => {
  test('accepts a plain command with $PORT', () => {
    expect(isOneLineCommand('npm run dev -- --port "$PORT"')).toBe(true)
  })

  test.each(['npm run dev\nrm -rf ~', 'a\rb', 'a\u0003b', 'a\u001bb'])(
    'refuses control characters in %j',
    (command) => {
      expect(isOneLineCommand(command)).toBe(false)
    },
  )
})

test('devServerUrl points at localhost on the port', () => {
  expect(devServerUrl(4100)).toBe('http://localhost:4100')
})

describe('urlHost', () => {
  test('is the host (with any port) a link opens, so it can be shown before opening', () => {
    expect(urlHost('https://app-git-login.vercel.app/path?q=1')).toBe('app-git-login.vercel.app')
    expect(urlHost('http://127.0.0.1:4000/x')).toBe('127.0.0.1:4000')
  })

  test('is null for something that is not a web URL', () => {
    expect(urlHost('not a url')).toBeNull()
    expect(urlHost('file:///etc/passwd')).toBeNull()
  })
})
