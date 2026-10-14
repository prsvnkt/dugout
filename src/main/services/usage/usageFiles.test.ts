import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { UsageFiles } from './usageFiles'
import { applyEntries, EMPTY_STATE, type LedgerEntry } from './usageState'

let dir: string
let paths: { ledger: string; state: string }

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'dugout-usage-files-'))
  paths = { ledger: join(dir, 'ledger.jsonl'), state: join(dir, 'state.json') }
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(dir, { recursive: true, force: true })
})

function entry(key: string, input = 10): LedgerEntry {
  return {
    projectId: 'p1',
    agent: 'claude',
    task: null,
    sessionId: 's1',
    cwd: '/repos/demo',
    at: '2026-10-08T12:00:00.000Z',
    day: '2026-10-08',
    model: 'claude-opus-4-5',
    key,
    kind: 'message',
    tokens: { input, output: 0, cacheRead: 0, cacheWrite: 0 },
    costUsd: 0.01,
  }
}

const line = (value: unknown) => `${JSON.stringify(value)}\n`

describe('UsageFiles.load', () => {
  test('starts empty when neither file exists', async () => {
    const state = await new UsageFiles(paths).load()

    expect(state).toEqual(EMPTY_STATE)
  })

  test('skips corrupt and invalid ledger lines and keeps the rest', async () => {
    await writeFile(
      paths.ledger,
      [
        line(entry('m1')),
        '{"projectId": "p1", truncated\n',
        line({ ...entry('m2'), day: '8 Oct 2026' }),
        line({ ...entry('m3'), tokens: { input: -1, output: 0, cacheRead: 0, cacheWrite: 0 } }),
        '\n   \n',
        line(entry('m4')),
      ].join(''),
    )

    const state = await new UsageFiles(paths).load()

    expect(Object.keys(state.seen).sort()).toEqual(['m1', 'm4'])
    expect(Object.values(state.rows)[0]?.totals.input).toBe(20)
    expect(state.ledgerBytes).toBe((await stat(paths.ledger)).size)
  })

  test('replays only the ledger lines written after the saved state', async () => {
    const files = new UsageFiles(paths)
    const ledgerBytes = await files.append([entry('m1')])
    await files.save({ ...applyEntries(EMPTY_STATE, [entry('m1')]), ledgerBytes })
    await files.append([entry('m2')])

    const state = await files.load()

    expect(Object.keys(state.seen).sort()).toEqual(['m1', 'm2'])
    expect(Object.values(state.rows)[0]?.totals.input).toBe(20)
  })

  test('replays nothing when the ledger is shorter than the state says', async () => {
    const files = new UsageFiles(paths)
    await files.save({ ...applyEntries(EMPTY_STATE, [entry('m1')]), ledgerBytes: 10_000 })
    await writeFile(paths.ledger, line(entry('m2')))

    const state = await files.load()

    expect(Object.keys(state.seen)).toEqual(['m1'])
    expect(state.ledgerBytes).toBe((await stat(paths.ledger)).size)
  })

  test.each([
    ['not JSON', '{ nope'],
    ['the wrong shape', JSON.stringify({ version: 2, rows: [] })],
  ])('rebuilds from the ledger when the state file is %s', async (_label, text) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await writeFile(paths.state, text)
    await writeFile(paths.ledger, line(entry('m1')))

    const state = await new UsageFiles(paths).load()

    expect(Object.keys(state.seen)).toEqual(['m1'])
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('UsageFiles.append and save', () => {
  test('appends one JSON line per entry and returns the new size', async () => {
    const files = new UsageFiles(paths)

    const size = await files.append([entry('m1'), entry('m2')])

    const text = await readFile(paths.ledger, 'utf8')
    const keys = text
      .trimEnd()
      .split('\n')
      .map((l) => (JSON.parse(l) as LedgerEntry).key)
    expect(keys).toEqual(['m1', 'm2'])
    expect(size).toBe(Buffer.byteLength(text))
  })

  test('returns 0 and writes nothing for no entries and no ledger', async () => {
    const size = await new UsageFiles(paths).append([])

    expect(size).toBe(0)
    await expect(stat(paths.ledger)).rejects.toThrow()
  })

  test('saves a state that loads back unchanged', async () => {
    const files = new UsageFiles(paths)
    const ledgerBytes = await files.append([entry('m1')])
    const saved = { ...applyEntries(EMPTY_STATE, [entry('m1')]), ledgerBytes }

    await files.save(saved)

    expect(await files.load()).toEqual(saved)
  })
})
