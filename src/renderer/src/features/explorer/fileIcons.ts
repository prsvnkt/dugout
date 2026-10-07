import setiDefinitions from './seti/definitions.json'
import setiIcons from './seti/icons.json'

/** Seti UI's colour names (see seti/LICENSE.md). */
type SetiColor =
  | 'blue'
  | 'grey'
  | 'grey-light'
  | 'green'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'red'
  | 'white'
  | 'yellow'
  | 'ignore'

type SetiEntry = readonly [icon: string, color: string]

interface SetiDefinitions {
  readonly files: Readonly<Record<string, SetiEntry>>
  readonly extensions: Readonly<Record<string, SetiEntry>>
  readonly partials: readonly (readonly [part: string, entry: SetiEntry])[]
  readonly default: SetiEntry
}

const DEFINITIONS = setiDefinitions as unknown as SetiDefinitions
const ICONS: Readonly<Record<string, string>> = setiIcons

/** Seti's colours are tuned for dark themes; these keep icons readable on white. */
const COLORS: Readonly<Record<SetiColor, string>> = {
  blue: 'var(--glyph-blue)',
  yellow: 'var(--glyph-yellow)',
  green: 'var(--project-green)',
  orange: 'var(--project-orange)',
  pink: 'var(--project-pink)',
  purple: 'var(--project-purple)',
  red: 'var(--project-red)',
  grey: 'var(--text-muted)',
  'grey-light': 'var(--text-muted)',
  white: 'var(--text-faint)',
  ignore: 'var(--text-faint)',
}

/** A file type icon: Seti's SVG markup and a colour token for `currentColor`. */
export interface FileIcon {
  readonly id: string
  readonly svg: string
  readonly color: string
}

const hasOwn = (record: object, key: string) => Object.prototype.hasOwnProperty.call(record, key)

/** Exact name, then the longest extension (`.d.ts` before `.ts`), then partial names. */
function setiEntry(name: string): SetiEntry {
  if (hasOwn(DEFINITIONS.files, name)) return DEFINITIONS.files[name] as SetiEntry
  for (let dot = name.indexOf('.'); dot !== -1; dot = name.indexOf('.', dot + 1)) {
    const extension = name.slice(dot)
    if (hasOwn(DEFINITIONS.extensions, extension)) {
      return DEFINITIONS.extensions[extension] as SetiEntry
    }
  }
  const partial = DEFINITIONS.partials.find(([part]) => name.includes(part))
  return partial ? partial[1] : DEFINITIONS.default
}

export function iconFor(name: string): FileIcon {
  const [id, color] = setiEntry(name)
  return {
    id,
    svg: ICONS[id] ?? ICONS[DEFINITIONS.default[0]] ?? '',
    color: COLORS[color as SetiColor] ?? COLORS.white,
  }
}
