import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { resolveRepoRoot } from './resolveRepoRoot'

function makeTempDir(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'dugout-git-')))
}

describe('resolveRepoRoot', () => {
  test('returns the repository top level for a subfolder', async () => {
    const repo = makeTempDir()
    execFileSync('git', ['init', '-q'], { cwd: repo })
    const nested = join(repo, 'packages', 'app')
    mkdirSync(nested, { recursive: true })

    expect(await resolveRepoRoot(nested)).toBe(repo)
  })

  test('returns null for a folder outside any repository', async () => {
    expect(await resolveRepoRoot(makeTempDir())).toBeNull()
  })

  test('returns null for a path that does not exist', async () => {
    expect(await resolveRepoRoot('/definitely/not/here')).toBeNull()
  })
})
