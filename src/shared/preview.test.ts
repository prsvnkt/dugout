import { describe, expect, test } from 'vitest'
import { devServerUrl, isOneLineCommand, toWebUrl } from './preview'

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
