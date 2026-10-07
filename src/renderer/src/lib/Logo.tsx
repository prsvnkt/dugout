import styles from './Logo.module.css'

interface LogoProps {
  readonly size: number
}

/** The Dugout mark (resources/logo.svg): a dugout bench with four agents in it. */
export function Logo({ size }: LogoProps) {
  return (
    <svg
      className={styles.logo}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label="Dugout"
    >
      <rect className={styles.field} width="100" height="100" rx="22" />
      <rect className={styles.frame} x="16" y="21" width="68" height="60" rx="9" />
      <path className={styles.roof} d="M16 34 V30 A9 9 0 0 1 25 21 H75 A9 9 0 0 1 84 30 V34 Z" />
      <path className={styles.bench} d="M28 67 H72" />
      <circle className={styles.green} cx="34.5" cy="57" r="4.9" />
      <circle className={styles.blue} cx="45" cy="57" r="4.9" />
      <circle className={styles.amber} cx="55.5" cy="57" r="4.9" />
      <circle className={styles.violet} cx="66" cy="57" r="4.9" />
    </svg>
  )
}
