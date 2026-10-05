import { describe, expect, test } from 'vitest'
import { folderNameFromUrl } from './folderName'

describe('folderNameFromUrl', () => {
  test.each([
    ['https://github.com/octo/app.git', 'app'],
    ['git@github.com:octo/my-repo.git', 'my-repo'],
    ['https://github.com/octo/app/', 'app'],
    ['/Users/me/repos/thing.git', 'thing'],
    ['https://gitlab.com/group/sub/proj', 'proj'],
  ])('%s → %s', (url, name) => {
    expect(folderNameFromUrl(url)).toBe(name)
  })

  test('replaces characters that are not valid in a folder name', () => {
    expect(folderNameFromUrl('https://example.com/a b+c.git')).toBe('a-b-c')
  })

  test('returns an empty name when there is nothing usable', () => {
    expect(folderNameFromUrl('')).toBe('')
  })
})
