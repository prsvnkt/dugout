import type { ITerminalOptions } from '@xterm/xterm'

export const XTERM_OPTIONS: ITerminalOptions = {
  fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace",
  fontSize: 13,
  fontWeight: 500,
  fontWeightBold: 700,
  lineHeight: 1.3,
  // Claude Code draws tool output and hints as dim text, which xterm renders at half opacity:
  // on the light background that fell to ~1.6:1. Darken any colour below 4.5:1 (decision 033).
  minimumContrastRatio: 4.5,
  cursorBlink: true,
  scrollback: 10_000,
  allowProposedApi: true,
  macOptionIsMeta: true,
  // "Day game" light theme; matches --bg-canvas. Claude Code itself should use a light /theme.
  theme: {
    background: '#fbfbfc',
    foreground: '#14171c',
    cursor: '#14171c',
    cursorAccent: '#fbfbfc',
    selectionBackground: '#dbe4f5',
    black: '#14171c',
    red: '#b91c1c',
    green: '#15803d',
    yellow: '#a16207',
    blue: '#2563eb',
    magenta: '#7c3aed',
    cyan: '#0e7490',
    white: '#6b7280',
    brightBlack: '#545b66',
    brightRed: '#dc2626',
    brightGreen: '#16a34a',
    brightYellow: '#ca8a04',
    brightBlue: '#3b82f6',
    brightMagenta: '#8b5cf6',
    brightCyan: '#0891b2',
    brightWhite: '#8a919c',
  },
}
