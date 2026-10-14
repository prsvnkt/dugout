import { describe, expectTypeOf, test } from 'vitest'
import type { DugoutApi } from './api'
import type { DeviceCodePrompt, GitHubAccount, GitHubAuthState, GitHubRepo } from './github'
import type { LinearAccount, LinearState, LinearTeam } from './linear'
import type { FailingCheck, PullRequestStatus, PullReviewThread } from './pullRequest'
import type { Result } from './result'

/*
 * Decisions 015 and 051: the GitHub token and the Linear API key never leave main. These are
 * type-level checks (run by `tsc` in `npm run check`): a credential field added to any type the
 * renderer receives fails the build.
 */

/** Field names a credential would be stored under. */
type CredentialKey =
  | 'token'
  | 'accessToken'
  | 'access_token'
  | 'refreshToken'
  | 'apiKey'
  | 'api_key'
  | 'secret'
  | 'password'
  | 'deviceCode'
  | 'device_code'

/** Every property name in `T`, through unions, arrays and nested objects. */
type DeepKeys<T> = T extends readonly (infer Item)[]
  ? DeepKeys<Item>
  : T extends object
    ? { [K in keyof T]-?: K | DeepKeys<T[K]> }[keyof T]
    : never

/** The success value of an API method's `Result`. */
type Resolved<F> = F extends (...args: never[]) => Promise<Result<infer Value>> ? Value : never

type GitHubApi = DugoutApi['github']
type LinearApi = DugoutApi['linear']

describe('renderer-facing GitHub and Linear types carry no credential', () => {
  test('GitHub auth state, in every status', () => {
    expectTypeOf<Extract<DeepKeys<GitHubAuthState>, CredentialKey>>().toEqualTypeOf<never>()
    expectTypeOf<Extract<GitHubAuthState, { status: 'signed-in' }>>().not.toHaveProperty(
      'accessToken',
    )
    expectTypeOf<DeviceCodePrompt>().not.toHaveProperty('deviceCode')
    expectTypeOf<DeviceCodePrompt>().not.toHaveProperty('accessToken')
    expectTypeOf<GitHubAccount>().not.toHaveProperty('accessToken')
  })

  test('what the github API resolves to', () => {
    expectTypeOf<Resolved<GitHubApi['listRepos']>>().toEqualTypeOf<readonly GitHubRepo[]>()
    expectTypeOf<Resolved<GitHubApi['getState']>>().toEqualTypeOf<GitHubAuthState>()
    expectTypeOf<GitHubRepo>().not.toHaveProperty('accessToken')
    type Values =
      | Resolved<GitHubApi['getState']>
      | Resolved<GitHubApi['listRepos']>
      | Resolved<GitHubApi['startSignIn']>
    expectTypeOf<Extract<DeepKeys<Values>, CredentialKey>>().toEqualTypeOf<never>()
  })

  test('pull request status, review threads and failing checks', () => {
    type Values = PullRequestStatus | PullReviewThread | FailingCheck
    expectTypeOf<Extract<DeepKeys<Values>, CredentialKey>>().toEqualTypeOf<never>()
  })

  test('Linear state, account and teams', () => {
    expectTypeOf<Resolved<LinearApi['connect']>>().toEqualTypeOf<LinearState>()
    expectTypeOf<Extract<LinearState, { status: 'connected' }>>().not.toHaveProperty('apiKey')
    expectTypeOf<LinearAccount>().not.toHaveProperty('apiKey')
    expectTypeOf<LinearTeam>().not.toHaveProperty('apiKey')
    type Values =
      | Resolved<LinearApi['getState']>
      | Resolved<LinearApi['connect']>
      | Resolved<LinearApi['disconnect']>
      | Resolved<LinearApi['listTeams']>
    expectTypeOf<Extract<DeepKeys<Values>, CredentialKey>>().toEqualTypeOf<never>()
  })

  test('the deep key check sees a credential in any union member', () => {
    type Leaky = { status: 'a' } | { status: 'b'; session: { accessToken: string } }

    expectTypeOf<Extract<DeepKeys<Leaky>, CredentialKey>>().toEqualTypeOf<'accessToken'>()
  })
})
