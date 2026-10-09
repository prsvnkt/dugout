import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { safeLinkUrl } from './safeLink'
import styles from './Markdown.module.css'

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
  img: ({ src, alt }) => {
    const url = safeLinkUrl(typeof src === 'string' ? src : null)
    const label = alt || 'image'
    if (!url) return <span className={styles.unsafeLink}>{label}</span>
    return (
      <a href={url} target="_blank" rel="noreferrer noopener" title={url}>
        {label}
      </a>
    )
  },
  input: ({ type, checked }) =>
    type === 'checkbox' ? (
      <input type="checkbox" checked={checked ?? false} readOnly disabled />
    ) : null,
}

/**
 * GitHub-flavoured markdown (headings, lists, code, tables, task lists) without raw HTML:
 * react-markdown drops HTML unless rehype-raw is added, which it never is here.
 */
export function Markdown({ text }: { text: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  )
}
