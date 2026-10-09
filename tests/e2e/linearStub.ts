import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

export const LINEAR_STUB_KEY = 'lin_api_stub_secret_key'

export interface LinearStubIssue {
  number: number
  title: string
  description: string
  stateId: string
  labels: string[]
  priority: number
  comments: { body: string }[]
}

const TEAM = { id: 'team-eng', key: 'ENG', name: 'Engineering' }
const STATES = [
  { id: 'state-todo', name: 'Todo', type: 'unstarted', position: 1 },
  { id: 'state-doing', name: 'In Progress', type: 'started', position: 2 },
  { id: 'state-review', name: 'In Review', type: 'started', position: 3 },
  { id: 'state-done', name: 'Done', type: 'completed', position: 4 },
]

type Variables = Record<string, unknown>
type Input = Record<string, unknown>

/** A tiny stand-in for api.linear.app/graphql: one team (ENG), answering Dugout's operations. */
export async function startLinearStub(issues: LinearStubIssue[]) {
  let baseUrl = ''
  const node = (issue: LinearStubIssue) => {
    const state = STATES.find((candidate) => candidate.id === issue.stateId) ?? STATES[0]
    return {
      id: `uuid-${issue.number}`,
      identifier: `ENG-${issue.number}`,
      number: issue.number,
      title: issue.title,
      description: issue.description,
      url: `${baseUrl}/acme/issue/ENG-${issue.number}`,
      priority: issue.priority,
      updatedAt: '2026-10-01T00:00:00.000Z',
      creator: { name: 'Ada' },
      state: { name: state?.name, type: state?.type },
      labels: { nodes: issue.labels.map((name) => ({ id: `label-${name}`, name })) },
    }
  }
  const byId = (id: unknown) =>
    issues.find((issue) => `uuid-${issue.number}` === id || `ENG-${issue.number}` === id)
  const labelName = (id: string) => id.replace(/^label-/, '')

  const update = (issue: LinearStubIssue, input: Input) => {
    if (typeof input.title === 'string') issue.title = input.title
    if (typeof input.description === 'string') issue.description = input.description
    if (typeof input.stateId === 'string') issue.stateId = input.stateId
    if (typeof input.priority === 'number') issue.priority = input.priority
    const added = ((input.addedLabelIds as string[] | undefined) ?? []).map(labelName)
    const removed = ((input.removedLabelIds as string[] | undefined) ?? []).map(labelName)
    issue.labels = [...issue.labels.filter((name) => !removed.includes(name)), ...added]
  }

  const answers: Record<string, (variables: Variables) => unknown> = {
    DugoutViewer: () => ({ viewer: { name: 'Ada Lovelace', organization: { name: 'Acme' } } }),
    DugoutTeams: () => ({ teams: { nodes: [{ key: TEAM.key, name: TEAM.name }] } }),
    DugoutTeam: ({ key }) => ({
      teams: { nodes: key === TEAM.key ? [{ ...TEAM, states: { nodes: STATES } }] : [] },
    }),
    DugoutIssues: () => ({
      issues: { nodes: issues.map(node), pageInfo: { hasNextPage: false, endCursor: null } },
    }),
    DugoutIssue: ({ id }) => {
      const issue = byId(id)
      return {
        issue: issue && {
          ...node(issue),
          comments: {
            nodes: issue.comments.map((comment) => ({
              ...comment,
              createdAt: '2026-10-02T00:00:00.000Z',
              user: { name: 'Ada' },
            })),
          },
        },
      }
    },
    DugoutUpdateIssue: ({ id, input }) => {
      const issue = byId(id)
      if (issue) update(issue, input as Input)
      return { issueUpdate: { success: Boolean(issue), issue: issue && node(issue) } }
    },
    DugoutComment: ({ input }) => {
      const { issueId, body } = input as { issueId: string; body: string }
      byId(issueId)?.comments.push({ body })
      return { commentCreate: { success: Boolean(byId(issueId)) } }
    },
    DugoutLabels: ({ names }) => ({
      issueLabels: {
        nodes: (names as string[]).map((name) => ({ id: `label-${name}`, name, team: null })),
      },
    }),
    DugoutCreateIssue: ({ input }) => {
      const { title, description } = input as { title: string; description: string }
      const issue: LinearStubIssue = {
        number: Math.max(0, ...issues.map((candidate) => candidate.number)) + 1,
        title,
        description,
        stateId: 'state-todo',
        labels: [],
        priority: 0,
        comments: [],
      }
      issues.push(issue)
      return { issueCreate: { success: true, issue: node(issue) } }
    },
  }

  const server: Server = createServer((req, res) => {
    let body = ''
    req.on('data', (chunk: Buffer) => (body += chunk.toString()))
    req.on('end', () => {
      const json = (status: number, payload: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' })
        res.end(JSON.stringify(payload))
      }
      if (req.headers.authorization !== LINEAR_STUB_KEY) {
        return json(401, { errors: [{ message: 'Authentication required' }] })
      }
      const { query, variables } = JSON.parse(body) as { query: string; variables: Variables }
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? ''
      const answer = answers[operation]
      if (!answer) return json(400, { errors: [{ message: `Unknown operation ${operation}` }] })
      return json(200, { data: answer(variables) })
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  return {
    baseUrl,
    issues,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
