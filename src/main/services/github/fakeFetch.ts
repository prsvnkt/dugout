/** Test helper: a scripted fetch that records requests and replies from a queue per route. */
export interface RecordedRequest {
  readonly method: string
  readonly url: string
  readonly headers: Record<string, string>
  readonly body: string
}

type Reply = { status?: number; json: unknown } | (() => { status?: number; json: unknown })

export function fakeFetch(routes: Record<string, Reply[]>) {
  const requests: RecordedRequest[] = []
  const fetch = async (input: string | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    requests.push({
      method,
      url,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: typeof init?.body === 'string' ? init.body : String(init?.body ?? ''),
    })
    const key = `${method} ${new URL(url).pathname}`
    const queue = routes[key]
    const next = queue && queue.length > 1 ? queue.shift() : queue?.[0]
    if (!next) return new Response('not found', { status: 404 })
    const reply = typeof next === 'function' ? next() : next
    return new Response(JSON.stringify(reply.json), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    })
  }
  return { fetch: fetch as typeof globalThis.fetch, requests }
}
