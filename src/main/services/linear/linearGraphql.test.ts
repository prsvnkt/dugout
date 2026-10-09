import { describe, expect, test } from 'vitest'
import { LINEAR_UNAVAILABLE, linearGraphql, LinearUnauthorizedError } from './linearGraphql'

const API_URL = 'https://api.linear.test/graphql'

function respond(status: number, body: unknown) {
  const fetch = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  return { fetch: fetch as unknown as typeof globalThis.fetch, apiUrl: API_URL }
}

const call = (deps: ReturnType<typeof respond>) =>
  linearGraphql(deps, 'lin_api_secret', 'query Q { viewer { name } }')

describe('linearGraphql', () => {
  test('returns the data', async () => {
    await expect(call(respond(200, { data: { viewer: { name: 'Ada' } } }))).resolves.toEqual({
      viewer: { name: 'Ada' },
    })
  })

  test('a rejected key is reported as such, without the key', async () => {
    const http401 = call(respond(401, {}))
    await expect(http401).rejects.toBeInstanceOf(LinearUnauthorizedError)
    const graphqlAuth = call(
      respond(400, { errors: [{ message: 'x', extensions: { code: 'AUTHENTICATION_ERROR' } }] }),
    )
    await expect(graphqlAuth).rejects.toThrow('did not accept the API key')
    await expect(graphqlAuth).rejects.not.toThrow('lin_api_secret')
  })

  test('explains rate limits and shows Linear’s own messages', async () => {
    await expect(
      call(respond(400, { errors: [{ message: 'x', extensions: { code: 'RATELIMITED' } }] })),
    ).rejects.toThrow('API limit')
    await expect(
      call(
        respond(200, {
          errors: [{ message: 'raw', extensions: { userPresentableMessage: 'Title is too long' } }],
        }),
      ),
    ).rejects.toThrow('Title is too long')
  })

  test('network failures and server errors say Linear cannot be reached', async () => {
    const offline = {
      fetch: (async () => Promise.reject(new Error('ENOTFOUND'))) as typeof globalThis.fetch,
      apiUrl: API_URL,
    }
    await expect(call(offline)).rejects.toThrow(LINEAR_UNAVAILABLE)
    await expect(call(respond(503, {}))).rejects.toThrow(LINEAR_UNAVAILABLE)
  })

  test('a response without data is an error', async () => {
    await expect(call(respond(200, {}))).rejects.toThrow('HTTP 200')
  })
})
