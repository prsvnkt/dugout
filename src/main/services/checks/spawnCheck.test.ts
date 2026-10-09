import { mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { shellCheckSpawner } from './spawnCheck'

function runToEnd(command: string, cwd: string) {
  const spawnCheck = shellCheckSpawner({ SHELL: '/bin/sh', PATH: '/usr/bin:/bin' })
  let output = ''
  return {
    exit: new Promise<number | null>((resolve, reject) => {
      const process = spawnCheck(command, cwd, {
        onOutput: (chunk) => (output += chunk),
        onExit: resolve,
        onError: reject,
      })
      if (command.startsWith('sleep')) setTimeout(() => process.kill(), 100)
    }),
    output: () => output,
  }
}

describe('shellCheckSpawner', () => {
  test('runs the command in the folder and reports its output and exit code', async () => {
    // Arrange
    const folder = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-check-')))

    // Act
    const run = runToEnd('pwd; echo oops >&2; exit 3', folder)

    // Assert
    expect(await run.exit).toBe(3)
    expect(run.output()).toContain(folder)
    expect(run.output()).toContain('oops')
  })

  test('kill stops the command', async () => {
    const run = runToEnd('sleep 30', tmpdir())

    expect(await run.exit).toBeNull()
  })
})
