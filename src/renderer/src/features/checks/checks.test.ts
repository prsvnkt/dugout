import { describe, expect, it } from 'vitest'
import type { CheckStatus } from '@shared/checks'
import { checkFailurePrompt, checkLabel, mostUrgentCheck } from './checks'

const running: CheckStatus = { state: 'running', command: 'npm test' }
const passed: CheckStatus = { state: 'passed', command: 'npm test', durationMs: 1200 }
const failed: CheckStatus = { state: 'failed', command: 'npm test', exitCode: 1, output: 'boom' }

describe('mostUrgentCheck', () => {
  it('puts a failure first, then a running check, then a pass', () => {
    expect(mostUrgentCheck([passed, failed, running])).toBe(failed)
    expect(mostUrgentCheck([passed, running])).toBe(running)
    expect(mostUrgentCheck([passed])).toBe(passed)
  })

  it('is null when no check ran', () => {
    expect(mostUrgentCheck([{ state: 'idle' }])).toBeNull()
    expect(mostUrgentCheck([])).toBeNull()
  })
})

describe('checkLabel', () => {
  it('says what the check is doing in words', () => {
    expect(checkLabel(running)).toBe('Checking…')
    expect(checkLabel(passed)).toBe('Check passed')
    expect(checkLabel(failed)).toBe('Check failed')
  })
})

describe('checkFailurePrompt', () => {
  it('names the command and exit code and quotes the output', () => {
    // Act
    const prompt = checkFailurePrompt({
      state: 'failed',
      command: 'npm run check',
      exitCode: 2,
      output: 'src/a.ts(3,1): error TS2304',
    })

    // Assert
    expect(prompt).toBe(
      [
        'The project check `npm run check` failed (exit code 2) after your last turn.',
        'Fix what it reports, then finish again.',
        '',
        'Output (last lines):',
        '```',
        'src/a.ts(3,1): error TS2304',
        '```',
      ].join('\n'),
    )
  })

  it('says when the check was stopped rather than exiting', () => {
    const prompt = checkFailurePrompt({ ...failed, exitCode: null })

    expect(prompt.split('\n')[0]).toBe(
      'The project check `npm test` failed (it was stopped) after your last turn.',
    )
  })

  it('uses a longer fence when the output contains one', () => {
    const prompt = checkFailurePrompt({ ...failed, output: 'a\n```\nb' })

    expect(prompt).toContain('````\na\n```\nb\n````')
  })

  it('says so when the check printed nothing', () => {
    const prompt = checkFailurePrompt({ ...failed, output: '' })

    expect(prompt).toContain('It printed nothing.')
    expect(prompt).not.toContain('```')
  })
})
