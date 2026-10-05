/** A compact text glyph and colour token per file type, VS Code-style. */
export interface FileIcon {
  readonly glyph: string
  readonly color: string
}

const BY_EXTENSION: Readonly<Record<string, FileIcon>> = {
  ts: { glyph: 'TS', color: 'var(--project-blue)' },
  tsx: { glyph: 'TS', color: 'var(--project-blue)' },
  js: { glyph: 'JS', color: 'var(--project-yellow)' },
  jsx: { glyph: 'JS', color: 'var(--project-yellow)' },
  mjs: { glyph: 'JS', color: 'var(--project-yellow)' },
  cjs: { glyph: 'JS', color: 'var(--project-yellow)' },
  json: { glyph: '{}', color: 'var(--project-yellow)' },
  md: { glyph: 'M', color: 'var(--project-blue)' },
  css: { glyph: '#', color: 'var(--project-purple)' },
  scss: { glyph: '#', color: 'var(--project-pink)' },
  html: { glyph: '<>', color: 'var(--project-orange)' },
  py: { glyph: 'Py', color: 'var(--project-green)' },
  go: { glyph: 'Go', color: 'var(--project-teal)' },
  rs: { glyph: 'Rs', color: 'var(--project-orange)' },
  sh: { glyph: '$', color: 'var(--project-green)' },
  yml: { glyph: 'Y', color: 'var(--project-purple)' },
  yaml: { glyph: 'Y', color: 'var(--project-purple)' },
  svg: { glyph: '◇', color: 'var(--project-orange)' },
  png: { glyph: '▣', color: 'var(--project-purple)' },
  jpg: { glyph: '▣', color: 'var(--project-purple)' },
}

const BY_NAME: Readonly<Record<string, FileIcon>> = {
  '.gitignore': { glyph: '◆', color: 'var(--project-orange)' },
  '.env': { glyph: '⚙', color: 'var(--project-yellow)' },
  Dockerfile: { glyph: '⛴', color: 'var(--project-blue)' },
}

const DEFAULT_ICON: FileIcon = { glyph: '≡', color: 'var(--text-muted)' }

export function iconFor(name: string): FileIcon {
  const byName = BY_NAME[name]
  if (byName) return byName
  const extension = name.includes('.') ? (name.split('.').pop() ?? '').toLowerCase() : ''
  return BY_EXTENSION[extension] ?? DEFAULT_ICON
}
