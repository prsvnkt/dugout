import { iconFor } from './fileIcons'
import styles from './FileTypeIcon.module.css'

/** The Seti file-type icon for a file name, as in the explorer, source control and tabs. */
export function FileTypeIcon({ name }: { name: string }) {
  const icon = iconFor(name)
  return (
    <span
      className={styles.icon}
      style={{ color: icon.color }}
      // Static SVG from the vendored Seti icon set (seti/icons.json), never user data.
      dangerouslySetInnerHTML={{ __html: icon.svg }}
      aria-hidden
    />
  )
}
