import { describe, expect, test } from 'vitest'
import { parseCloneProgress } from './cloneProgress'

describe('parseCloneProgress', () => {
  test('reads the latest phase and percentage from carriage-return updates', () => {
    const chunk =
      "Cloning into 'app'...\nremote: Counting objects: 100% (12/12)\rReceiving objects:  45% (450/1000)\rReceiving objects:  52% (520/1000)"
    expect(parseCloneProgress(chunk)).toEqual({ phase: 'Receiving objects', percent: 52 })
  })

  test('strips the remote: prefix', () => {
    expect(parseCloneProgress('remote: Compressing objects:  10% (1/10)')).toEqual({
      phase: 'Compressing objects',
      percent: 10,
    })
  })

  test('reports a phase without a percentage', () => {
    expect(parseCloneProgress("Cloning into 'app'...\n")).toEqual({
      phase: 'Cloning into app',
      percent: null,
    })
  })

  test('returns null when there is nothing to report', () => {
    expect(parseCloneProgress('\n\r')).toBeNull()
  })
})
