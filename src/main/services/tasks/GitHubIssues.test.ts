import { describe, expect, test } from 'vitest'
import { fakeFetch } from '../github/fakeFetch'
import { GitHubIssues } from './GitHubIssues'

const REPO = { owner: 'octo', name: 'app' }

const issue = (number: number, extra: Record<string, unknown> = {}) => ({
  number,
  title: `Issue ${number}`,
  body: `Body ${number}`,
  state: 'open',
  html_url: `https://github.com/octo/app/issues/${number}`,
  user: { login: 'octo' },
  labels: [{ name: 'bug' }],
  comments: 2,
  updated_at: '2026-10-01T00:00:00Z',
  ...extra,
})

function setup(routes: Parameters<typeof fakeFetch>[0]) {
  const fake = fakeFetch(routes)
  return {
    issues: new GitHubIssues({ fetch: fake.fetch, apiBaseUrl: 'https://api.github.com' }),
    ...fake,
  }
}

describe('GitHubIssues', () => {
  test('lists issues (not pull requests) as tasks', async () => {
    const { issues, requests } = setup({
      'GET /repos/octo/app/issues': [
        {
          json: [
            issue(1),
            issue(2, { pull_request: {} }),
            issue(3, { state: 'closed', labels: [] }),
          ],
        },
      ],
    })

    const tasks = await issues.list('tok', REPO)

    expect(tasks.map((task) => [task.number, task.status])).toEqual([
      [1, 'todo'],
      [3, 'done'],
    ])
    expect(tasks[0]).toMatchObject({
      title: 'Issue 1',
      author: 'octo',
      labels: ['bug'],
      commentCount: 2,
    })
    expect(new URL(requests[0]?.url ?? '').searchParams.get('state')).toBe('all')
  })

  test('creates an issue', async () => {
    const { issues, requests } = setup({ 'POST /repos/octo/app/issues': [{ json: issue(7) }] })
    const task = await issues.create('tok', REPO, { title: 'New', body: 'Details' })
    expect(task.number).toBe(7)
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ title: 'New', body: 'Details' })
  })

  test('creates an issue with labels, a priority label and related tasks', async () => {
    const { issues, requests } = setup({
      'GET /repos/octo/app/labels/dugout:priority-high': [{ status: 404, json: {} }],
      'POST /repos/octo/app/labels': [{ json: { name: 'dugout:priority-high' } }],
      'POST /repos/octo/app/issues': [{ json: issue(8) }],
    })

    await issues.create('tok', REPO, {
      title: 'New',
      body: 'Details',
      labels: ['bug'],
      priority: 'high',
      related: [3],
    })

    const [label, created] = requests.filter((request) => request.method === 'POST')
    expect(JSON.parse(label?.body ?? '{}')).toMatchObject({
      name: 'dugout:priority-high',
      color: 'ef4444',
    })
    expect(JSON.parse(created?.body ?? '{}')).toEqual({
      title: 'New',
      body: 'Details\n\nRelated: #3',
      labels: ['bug', 'dugout:priority-high'],
    })
  })

  test('changes the priority and labels, keeping the status label', async () => {
    const { issues, requests } = setup({
      'GET /repos/octo/app/issues/5': [
        {
          json: issue(5, {
            labels: [
              { name: 'bug' },
              { name: 'dugout:in-progress' },
              { name: 'dugout:priority-low' },
            ],
          }),
        },
      ],
      'GET /repos/octo/app/labels/dugout:in-progress': [{ json: {} }],
      'GET /repos/octo/app/labels/dugout:priority-medium': [{ json: {} }],
      'PATCH /repos/octo/app/issues/5': [{ json: issue(5) }],
    })

    await issues.update('tok', REPO, 5, {
      priority: 'medium',
      addLabels: ['ui'],
      removeLabels: ['bug'],
    })

    const patch = requests.find((request) => request.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({
      labels: ['dugout:in-progress', 'dugout:priority-medium', 'ui'],
    })
  })

  test('adds related tasks to the current description', async () => {
    const { issues, requests } = setup({
      'GET /repos/octo/app/issues/5': [{ json: issue(5) }],
      'PATCH /repos/octo/app/issues/5': [{ json: issue(5) }],
    })

    await issues.update('tok', REPO, 5, { related: [2] })

    const patch = requests.find((request) => request.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({
      body: 'Body 5\n\nRelated: #2',
      labels: ['bug'],
    })
  })

  test('a title change alone does not read the issue first', async () => {
    const { issues, requests } = setup({
      'PATCH /repos/octo/app/issues/5': [{ json: issue(5) }],
    })
    await issues.update('tok', REPO, 5, { title: 'Renamed' })
    expect(requests.map((request) => request.method)).toEqual(['PATCH'])
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ title: 'Renamed' })
  })

  test('moves a task to in progress by ensuring and setting the label', async () => {
    const { issues, requests } = setup({
      'GET /repos/octo/app/issues/5': [{ json: issue(5) }],
      'GET /repos/octo/app/labels/dugout:in-progress': [{ status: 404, json: {} }],
      'POST /repos/octo/app/labels': [{ json: { name: 'dugout:in-progress' } }],
      'PATCH /repos/octo/app/issues/5': [
        { json: issue(5, { labels: [{ name: 'bug' }, { name: 'dugout:in-progress' }] }) },
      ],
    })

    const task = await issues.update('tok', REPO, 5, { status: 'in-progress' })

    expect(task.status).toBe('in-progress')
    const patch = requests.find((request) => request.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toEqual({
      state: 'open',
      labels: ['bug', 'dugout:in-progress'],
    })
  })

  test('marking done closes the issue', async () => {
    const { issues, requests } = setup({
      'GET /repos/octo/app/issues/5': [{ json: issue(5) }],
      'PATCH /repos/octo/app/issues/5': [{ json: issue(5, { state: 'closed' }) }],
    })
    await issues.update('tok', REPO, 5, { status: 'done' })
    const patch = requests.find((request) => request.method === 'PATCH')
    expect(JSON.parse(patch?.body ?? '{}')).toMatchObject({ state: 'closed' })
  })

  test('reads a task with its comments', async () => {
    const { issues } = setup({
      'GET /repos/octo/app/issues/5': [{ json: issue(5) }],
      'GET /repos/octo/app/issues/5/comments': [
        {
          json: [
            { user: { login: 'claude-bot' }, body: 'Started', created_at: '2026-10-02T00:00:00Z' },
          ],
        },
      ],
    })
    const detail = await issues.get('tok', REPO, 5)
    expect(detail.comments).toEqual([
      { author: 'claude-bot', body: 'Started', createdAt: '2026-10-02T00:00:00Z' },
    ])
  })

  test('adds a comment', async () => {
    const { issues, requests } = setup({
      'POST /repos/octo/app/issues/5/comments': [{ json: { id: 1 } }],
    })
    await issues.comment('tok', REPO, 5, 'Progress note')
    expect(JSON.parse(requests[0]?.body ?? '{}')).toEqual({ body: 'Progress note' })
  })
})
