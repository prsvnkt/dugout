import { describe, expect, test } from 'vitest'
import {
  gitCommitRequestSchema,
  gitPathsRequestSchema,
  gitProjectRequestSchema,
  projectAddRequestSchema,
  projectsFileSchema,
  projectUpdateRequestSchema,
  terminalCreateRequestSchema,
  terminalResizeRequestSchema,
  terminalWriteRequestSchema,
  workspaceSnapshotSchema,
} from './contract'

describe('terminalCreateRequestSchema', () => {
  const valid = { kind: 'claude', projectId: 'p1', cwd: '/Users/me/repo', cols: 120, rows: 40 }

  test('accepts a valid request', () => {
    expect(terminalCreateRequestSchema.parse(valid)).toEqual(valid)
  })

  test('rejects an unknown terminal kind', () => {
    expect(terminalCreateRequestSchema.safeParse({ ...valid, kind: 'bash' }).success).toBe(false)
  })

  test('requires the owning project', () => {
    const withoutProject = { kind: valid.kind, cwd: valid.cwd, cols: valid.cols, rows: valid.rows }
    expect(terminalCreateRequestSchema.safeParse(withoutProject).success).toBe(false)
  })

  test('rejects a relative cwd', () => {
    expect(terminalCreateRequestSchema.safeParse({ ...valid, cwd: 'repo' }).success).toBe(false)
  })

  test('rejects non-integer or out-of-range dimensions', () => {
    expect(terminalCreateRequestSchema.safeParse({ ...valid, cols: 0 }).success).toBe(false)
    expect(terminalCreateRequestSchema.safeParse({ ...valid, rows: 1.5 }).success).toBe(false)
    expect(terminalCreateRequestSchema.safeParse({ ...valid, cols: 100_000 }).success).toBe(false)
  })
})

describe('terminalWriteRequestSchema', () => {
  test('accepts terminal input', () => {
    expect(terminalWriteRequestSchema.safeParse({ id: 't1', data: 'ls\r' }).success).toBe(true)
  })

  test('rejects oversized input', () => {
    const data = 'x'.repeat(2 * 1024 * 1024)
    expect(terminalWriteRequestSchema.safeParse({ id: 't1', data }).success).toBe(false)
  })
})

describe('terminalResizeRequestSchema', () => {
  test('requires an id', () => {
    expect(terminalResizeRequestSchema.safeParse({ cols: 80, rows: 24 }).success).toBe(false)
  })
})

describe('project schemas', () => {
  test('trims and accepts a valid new project', () => {
    const parsed = projectAddRequestSchema.parse({
      name: '  Bene  ',
      rootPath: '/Users/me/bene',
      color: 'teal',
    })
    expect(parsed.name).toBe('Bene')
  })

  test('rejects blank names and unknown colours', () => {
    const base = { name: 'Bene', rootPath: '/Users/me/bene', color: 'teal' }
    expect(projectAddRequestSchema.safeParse({ ...base, name: '   ' }).success).toBe(false)
    expect(projectAddRequestSchema.safeParse({ ...base, color: 'mauve' }).success).toBe(false)
  })

  test('update accepts a partial change', () => {
    expect(projectUpdateRequestSchema.safeParse({ id: 'p1', color: 'blue' }).success).toBe(true)
  })

  test('update requires at least one field to change', () => {
    expect(projectUpdateRequestSchema.safeParse({ id: 'p1' }).success).toBe(false)
  })

  test('the projects file schema rejects malformed entries', () => {
    expect(projectsFileSchema.safeParse({ version: 1, projects: [{ id: 'p1' }] }).success).toBe(
      false,
    )
  })
})

describe('git schemas', () => {
  test('accepts relative repository paths', () => {
    const request = { projectId: 'p1', paths: ['src/a.ts', 'weird name*.txt'] }
    expect(gitPathsRequestSchema.safeParse(request).success).toBe(true)
  })

  test('rejects paths that could escape the repository', () => {
    for (const path of ['/etc/passwd', '../outside', 'src/../../x', '', 'a\0b']) {
      expect(gitPathsRequestSchema.safeParse({ projectId: 'p1', paths: [path] }).success).toBe(
        false,
      )
    }
  })

  test('requires at least one path', () => {
    expect(gitPathsRequestSchema.safeParse({ projectId: 'p1', paths: [] }).success).toBe(false)
  })

  test('rejects an empty commit message', () => {
    expect(gitCommitRequestSchema.safeParse({ projectId: 'p1', message: '  ' }).success).toBe(false)
  })
})

describe('git checkout targeting', () => {
  test('accepts an optional absolute worktree path', () => {
    expect(gitProjectRequestSchema.safeParse({ projectId: 'p1' }).success).toBe(true)
    expect(
      gitProjectRequestSchema.safeParse({ projectId: 'p1', worktreePath: '/wt/s1' }).success,
    ).toBe(true)
    expect(
      gitProjectRequestSchema.safeParse({ projectId: 'p1', worktreePath: 'wt/s1' }).success,
    ).toBe(false)
  })
})

describe('session persistence schemas', () => {
  test('resume ids must look like session ids', () => {
    const base = { kind: 'claude', projectId: 'p1', cwd: '/r', cols: 80, rows: 24 }
    const parse = (resumeSessionId: string) =>
      terminalCreateRequestSchema.safeParse({ ...base, resumeSessionId }).success
    expect(parse('a1-b2')).toBe(true)
    expect(parse('--dangerous')).toBe(false)
  })

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
