/** Test helper: a scripted Linear GraphQL endpoint that answers by operation name. */
export interface LinearCall {
  readonly operation: string
  readonly variables: Record<string, unknown>
  readonly authorization: string | null
}

type Answer = (variables: Record<string, unknown>) => unknown

export function fakeLinear(answers: Record<string, Answer>) {
  const calls: LinearCall[] = []
  const fetch = async (_input: string | URL, init?: RequestInit): Promise<Response> => {
    const { query, variables } = JSON.parse(String(init?.body)) as {
      query: string
      variables: Record<string, unknown>
    }
    const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? 'unknown'
    calls.push({
      operation,
      variables,
      authorization: new Headers(init?.headers).get('authorization'),
    })
    const answer = answers[operation]
    const body = answer
      ? { data: answer(variables) }
      : { errors: [{ message: `No answer for ${operation}` }] }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}
