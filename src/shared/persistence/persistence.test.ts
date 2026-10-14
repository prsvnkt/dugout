import { describe, expect, test } from 'vitest'
import { projectsFileSchema, workspaceSnapshotSchema } from '.'

describe('projects file schema', () => {
  test('the projects file schema rejects malformed entries', () => {
    expect(projectsFileSchema.safeParse({ version: 1, projects: [{ id: 'p1' }] }).success).toBe(
      false,
    )
  })
})

describe('session persistence schemas', () => {
  test('the workspace snapshot keeps kinds, worktrees and session ids', () => {
    const snapshot = {
      version: 1,
      projects: {
        p1: {
          panes: [
            { kind: 'claude', sessionId: 's1' },
            { kind: 'shell', worktree: { path: '/wt/a', branch: 'dugout/a', name: 'a' } },
          ],
        },
      },
    }
    expect(workspaceSnapshotSchema.parse(snapshot)).toEqual(snapshot)
    const bad = { version: 1, projects: { p1: { panes: [{}] } } }
    expect(workspaceSnapshotSchema.safeParse(bad).success).toBe(false)
  })
})
