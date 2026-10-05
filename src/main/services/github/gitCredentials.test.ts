import { describe, expect, test } from 'vitest'
import { gitCredentialConfig } from './gitCredentials'

describe('gitCredentialConfig', () => {
  test('answers git credential requests for the GitHub host from an env var', () => {
    const config = gitCredentialConfig('gho_secret', 'https://github.com')

    expect(config.args).toEqual([
      '-c',
      'credential.https://github.com.helper=',
      '-c',
      expect.stringMatching(/^credential\.https:\/\/github\.com\.helper=!/),
    ])
    expect(config.env).toEqual({ DUGOUT_GITHUB_TOKEN: 'gho_secret' })
  })

  test('never puts the token itself on the command line', () => {
    expect(gitCredentialConfig('gho_secret', 'https://github.com').args.join(' ')).not.toContain(
      'gho_secret',
    )
  })

  test('adds nothing when signed out', () => {
    expect(gitCredentialConfig(null, 'https://github.com')).toEqual({ args: [], env: {} })
  })
})
