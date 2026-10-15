import { useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeLinkUrl } from './safeLink'
import styles from './Markdown.module.css'

/**
 * The URL to draw an image from (a `dugout-file:` URL for an image in the checkout), or null
 * to treat it like any other image: as a link.
 */
export type ImageUrlResolver = (src: string) => string | null

interface ImageProps {
  readonly src?: unknown
  readonly alt?: string | undefined
}

/** An image as a link (https only), so it never loads remote content. */
function imageAsLink({ src, alt }: ImageProps) {
  const url = safeLinkUrl(typeof src === 'string' ? src : null)
  const label = alt || 'image'
  if (!url) return <span className={styles.unsafeLink}>{label}</span>
  return (
    <a href={url} target="_blank" rel="noreferrer noopener" title={url}>
      {label}
    </a>
  )
}

/**
 * Links open in the browser through main's window-open handler (https only); anything
 * else renders as text. Images become links, so a task never loads remote content.
 */
const COMPONENTS: Components = {
  a: ({ href, children }) => {
    const url = safeLinkUrl(href)
    if (!url) return <span className={styles.unsafeLink}>{children}</span>
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" title={url}>
        {children}
      </a>
    )
  },
  img: imageAsLink,
  input: ({ type, checked }) =>
    type === 'checkbox' ? (
      <input type="checkbox" checked={checked ?? false} readOnly disabled />
    ) : null,
}

/** COMPONENTS, drawing the images `imageUrl` resolves and linking the rest. */
function componentsWithImages(imageUrl: ImageUrlResolver): Components {
  const img = (props: ImageProps) => {
    const url = typeof props.src === 'string' ? imageUrl(props.src) : null
    if (!url) return imageAsLink(props)
    return <img className={styles.image} src={url} alt={props.alt ?? ''} loading="lazy" />
  }
  return { ...COMPONENTS, img }
}

interface MarkdownProps {
  readonly text: string
  /** Draws local images (a file's preview); without it every image is a link (tasks). */
  readonly imageUrl?: ImageUrlResolver | undefined
}

/**
 * GitHub-flavoured markdown (headings, lists, code, tables, task lists) without raw HTML:
 * react-markdown drops HTML unless rehype-raw is added, which it never is here.
 */
export function Markdown({ text, imageUrl }: MarkdownProps) {
  const components = useMemo(
    () => (imageUrl ? componentsWithImages(imageUrl) : COMPONENTS),
    [imageUrl],
  )
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
