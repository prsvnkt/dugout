import { describe, expect, test } from 'vitest'
import { XTERM_OPTIONS } from './xtermOptions'

const READABLE_RATIO = 4.5
const GREY_RATIO = 3

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0)
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

const theme = XTERM_OPTIONS.theme ?? {}
const background = theme.background ?? '#ffffff'

describe('XTERM_OPTIONS', () => {
  test('raises faint and dim text to a readable contrast', () => {
    expect(XTERM_OPTIONS.minimumContrastRatio).toBeGreaterThanOrEqual(READABLE_RATIO)
  })

  test.each([
    'foreground',
    'red',
    'green',
    'yellow',
    'blue',
    'magenta',
    'cyan',
    'brightBlack',
  ] as const)('%s reads at 4.5:1 on the background', (key) => {
    expect(contrast(theme[key] ?? '', background)).toBeGreaterThanOrEqual(READABLE_RATIO)
  })

  test.each(['white', 'brightWhite'] as const)('grey %s reads at 3:1 on the background', (key) => {
    expect(contrast(theme[key] ?? '', background)).toBeGreaterThanOrEqual(GREY_RATIO)
  })
})
