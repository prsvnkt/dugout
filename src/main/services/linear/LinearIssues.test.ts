import { describe, expect, test } from 'vitest'
import { fakeLinear } from './fakeLinear'
import { LinearIssues, type LinearIssueNode } from './LinearIssues'

const API_URL = 'https://api.linear.test/graphql'

const issue = (number: number, extra: Partial<LinearIssueNode> = {}): LinearIssueNode => ({
  id: `uuid-${number}`,
  identifier: `ENG-${number}`,
  number,
  title: `Issue ${number}`,
  description: `Body ${number}`,
  url: `https://linear.app/acme/issue/ENG-${number}/issue`,
  priority: 0,
  updatedAt: '2026-10-01T00:00:00Z',
  creator: { name: 'Ada' },
  state: { name: 'Todo', type: 'unstarted' },
  labels: { nodes: [] },
  ...extra,
})

const TEAM = {
  id: 'team-1',
  key: 'ENG',
  states: {
    nodes: [
      { id: 's-todo', name: 'Todo', type: 'unstarted', position: 1 },
      { id: 's-doing', name: 'In Progress', type: 'started', position: 2 },
      { id: 's-done', name: 'Done', type: 'completed', position: 3 },
    ],
  },
}

function setup(answers: Parameters<typeof fakeLinear>[0]) {
  const linear = fakeLinear({ DugoutTeam: () => ({ teams: { nodes: [TEAM] } }), ...answers })
  return { issues: new LinearIssues({ fetch: linear.fetch, apiUrl: API_URL }), calls: linear.calls }
}

const withIssue = (current: LinearIssueNode) => ({
  DugoutIssue: () => ({ issue: { ...current, comments: { nodes: [] } } }),
  DugoutUpdateIssue: (variables: Record<string, unknown>) => ({
    issueUpdate: { success: true, issue: { ...current, ...(variables.input as object) } },
  }),
})

describe('LinearIssues', () => {
  test('sends the personal API key as the bare Authorization header', async () => {
    const { issues, calls } = setup({
      DugoutViewer: () => ({ viewer: { name: 'Ada', organization: { name: 'Acme' } } }),
    })

    const account = await issues.viewer('lin_api_secret')

    expect(account).toEqual({ name: 'Ada', organization: 'Acme' })
    expect(calls[0]?.authorization).toBe('lin_api_secret')
  })

  test('lists the team’s issues as tasks, page by page', async () => {
    const pages = [
      {
        nodes: [
          issue(3, {
            priority: 1,
            state: { name: 'In Progress', type: 'started' },
            labels: { nodes: [{ id: 'l1', name: 'bug' }] },
          }),
        ],
        pageInfo: { hasNextPage: true, endCursor: 'c1' },
      },
      {
        nodes: [issue(2, { description: null, creator: null })],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]
    const { issues, calls } = setup({ DugoutIssues: () => ({ issues: pages.shift() }) })

    const tasks = await issues.list('key', 'ENG')

    expect(tasks).toEqual([
      {
        number: 3,
        key: 'ENG-3',
        title: 'Issue 3',
        body: 'Body 3',
        status: 'in-progress',
        url: 'https://linear.app/acme/issue/ENG-3/issue',
        author: 'Ada',
        labels: ['bug'],
        priority: 'high',
        commentCount: null,
        updatedAt: '2026-10-01T00:00:00Z',
      },
      expect.objectContaining({ number: 2, key: 'ENG-2', body: '', author: 'unknown' }),
    ])
    expect(calls.map((call) => call.variables)).toEqual([
      { key: 'ENG', first: 100, after: null },
      { key: 'ENG', first: 100, after: 'c1' },
    ])
  })

  test('gets an issue by its identifier, with comments oldest first', async () => {
    const { issues, calls } = setup({
      DugoutIssue: () => ({
        issue: {
          ...issue(7),
          comments: {
            nodes: [
              { body: 'second', createdAt: '2026-10-02T00:00:00Z', user: null },
              { body: 'first', createdAt: '2026-10-01T00:00:00Z', user: { name: 'Bo' } },
            ],
          },
        },
      }),
    })

    const task = await issues.get('key', 'ENG', 7)

    expect(calls[0]?.variables).toEqual({ id: 'ENG-7' })
    expect(task.commentCount).toBe(2)
    expect(task.comments).toEqual([
      { author: 'Bo', body: 'first', createdAt: '2026-10-01T00:00:00Z' },
      { author: 'unknown', body: 'second', createdAt: '2026-10-02T00:00:00Z' },
    ])
  })

  test('creates an issue in the team with priority, labels and related lines', async () => {
    const { issues, calls } = setup({
      DugoutLabels: () => ({
        issueLabels: {
          nodes: [
            { id: 'l-bug', name: 'bug', team: null },
            { id: 'l-other-team', name: 'ui', team: { id: 'team-2' } },
          ],
        },
      }),
      DugoutCreateLabel: () => ({
        issueLabelCreate: { success: true, issueLabel: { id: 'l-ui', name: 'ui' } },
      }),
      DugoutCreateIssue: () => ({ issueCreate: { success: true, issue: issue(9) } }),
    })

    const task = await issues.create('key', 'ENG', {
      title: 'New',
      body: 'Do it.',
      labels: ['bug', 'ui'],
      priority: 'medium',
      related: [3],
    })

    expect(task.key).toBe('ENG-9')
    expect(calls.find((call) => call.operation === 'DugoutCreateLabel')?.variables).toEqual({
      input: { name: 'ui', teamId: 'team-1' },
    })
    expect(calls.at(-1)?.variables).toEqual({
      input: {
        teamId: 'team-1',
        title: 'New',
        description: 'Do it.\n\nRelated: ENG-3',
        priority: 3,
        labelIds: ['l-bug', 'l-ui'],
      },
    })
  })

  test('moving to a status picks the team’s state and drops the in-review label', async () => {
    const current = issue(5, {
      state: { name: 'In Progress', type: 'started' },
      labels: {
        nodes: [
          { id: 'l-review', name: 'dugout:in-review' },
          { id: 'l-bug', name: 'bug' },
        ],
      },
    })
    const { issues, calls } = setup(withIssue(current))

    await issues.update('key', 'ENG', 5, { status: 'done', priority: null })

    expect(calls.at(-1)?.variables).toEqual({
      id: 'uuid-5',
      input: { stateId: 's-done', priority: 0, removedLabelIds: ['l-review'] },
    })
  })

  test('in review without a review state keeps the issue started and adds the label', async () => {
    const current = issue(5, { state: { name: 'Todo', type: 'unstarted' } })
    const { issues, calls } = setup({
      ...withIssue(current),
      DugoutLabels: () => ({ issueLabels: { nodes: [] } }),
      DugoutCreateLabel: () => ({
        issueLabelCreate: {
          success: true,
          issueLabel: { id: 'l-review', name: 'dugout:in-review' },
        },
      }),
    })

    await issues.update('key', 'ENG', 5, { status: 'in-review' })

    expect(calls.at(-1)?.variables).toEqual({
      id: 'uuid-5',
      input: { stateId: 's-doing', addedLabelIds: ['l-review'] },
    })
  })

  test('leaves the state alone when the issue already has the status', async () => {
    const current = issue(5, { state: { name: 'QA', type: 'started' } })
    const { issues, calls } = setup(withIssue(current))

    await issues.update('key', 'ENG', 5, { status: 'in-progress', title: 'Renamed' })

    expect(calls.map((call) => call.operation)).not.toContain('DugoutTeam')
    expect(calls.at(-1)?.variables).toEqual({ id: 'uuid-5', input: { title: 'Renamed' } })
  })

  test('removes labels by name and appends related tasks to the description', async () => {
    const current = issue(5, {
      description: 'Body\n\nRelated: ENG-1',
      labels: { nodes: [{ id: 'l-bug', name: 'bug' }] },
    })
    const { issues, calls } = setup(withIssue(current))

    await issues.update('key', 'ENG', 5, { removeLabels: ['bug', 'missing'], related: [1, 2] })

    expect(calls.at(-1)?.variables).toEqual({
      id: 'uuid-5',
      input: { description: 'Body\n\nRelated: ENG-1\nRelated: ENG-2', removedLabelIds: ['l-bug'] },
    })
  })

  test('comments on the issue by its id', async () => {
    const { issues, calls } = setup({
      ...withIssue(issue(5)),
      DugoutComment: () => ({ commentCreate: { success: true } }),
    })

    await issues.comment('key', 'ENG', 5, 'Halfway there.')

    expect(calls.at(-1)?.variables).toEqual({
      input: { issueId: 'uuid-5', body: 'Halfway there.' },
    })
  })

  test('lists teams, and explains an unknown team or issue', async () => {
    const { issues } = setup({
      DugoutTeams: () => ({ teams: { nodes: [{ key: 'ENG', name: 'Engineering', id: 'x' }] } }),
      DugoutTeam: () => ({ teams: { nodes: [] } }),
      DugoutIssue: () => ({ issue: null }),
    })

    await expect(issues.teams('key')).resolves.toEqual([{ key: 'ENG', name: 'Engineering' }])
    await expect(issues.create('key', 'OPS', { title: 'x', body: '' })).rejects.toThrow(
      'No Linear team with the key OPS',
    )
    await expect(issues.get('key', 'ENG', 404)).rejects.toThrow('ENG-404 was not found')
  })
})
