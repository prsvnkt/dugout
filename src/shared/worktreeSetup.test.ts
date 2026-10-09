import { describe, expect, it } from 'vitest'
import { isEmptySetup, isSafeCopyPattern, parseCopyPatterns } from './worktreeSetup'

describe('isSafeCopyPattern', () => {
  it('accepts globs relative to the repo', () => {
    expect(isSafeCopyPattern('.env*')).toBe(true)
    expect(isSafeCopyPattern('config/*.local.json')).toBe(true)
  })

  it('refuses absolute paths, parent folders and .git', () => {
    expect(isSafeCopyPattern('/etc/passwd')).toBe(false)
    expect(isSafeCopyPattern('../other/.env')).toBe(false)
    expect(isSafeCopyPattern('a/../../b')).toBe(false)
    expect(isSafeCopyPattern('.git/config')).toBe(false)
    expect(isSafeCopyPattern('')).toBe(false)
  })
})

describe('parseCopyPatterns', () => {
  it('splits lines and commas and drops blanks', () => {
    expect(parseCopyPatterns(' .env* \n\nconfig/*.json, .npmrc ,')).toEqual([
      '.env*',
      'config/*.json',
      '.npmrc',
    ])
  })
})

describe('isEmptySetup', () => {
  it('is empty without copies or a command', () => {
    expect(isEmptySetup({ copy: [] })).toBe(true)
    expect(isEmptySetup({ copy: ['.env'] })).toBe(false)
    expect(isEmptySetup({ copy: [], command: 'npm ci' })).toBe(false)
  })
})
