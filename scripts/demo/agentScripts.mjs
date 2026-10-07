/**
 * What each demo agent does, keyed by "<project folder>:<agent>". Steps run in order:
 * say (typed out), print, pause (ms), write (path, content), ask (waits for a typed line), stop.
 */
const dim = (text) => `\x1b[2m${text}\x1b[0m`
const tool = (name, detail) => `\x1b[36m●\x1b[0m \x1b[1m${name}\x1b[0m ${detail}`
const diffStat = (added, removed = 0) =>
  `\x1b[32m+${added}\x1b[0m${removed ? ` \x1b[31m-${removed}\x1b[0m` : ''}`

const WISHLIST_BUTTON = `import { useState } from 'react'
import { isWishlisted, toggleWishlist } from '../lib/wishlist'

interface WishlistButtonProps {
  productId: string
}

export function WishlistButton({ productId }: WishlistButtonProps) {
  const [saved, setSaved] = useState(() => isWishlisted(productId))

  return (
    <button
      className="wishlist"
      aria-pressed={saved}
      onClick={() => setSaved(toggleWishlist(productId))}
    >
      {saved ? '♥ Saved' : '♡ Save for later'}
    </button>
  )
}
`

const WISHLIST_LIB = `const STORAGE_KEY = 'storefront.wishlist'

function load(): string[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
}

export function isWishlisted(productId: string): boolean {
  return load().includes(productId)
}

/** Adds or removes the product and returns whether it is now saved. */
export function toggleWishlist(productId: string): boolean {
  const current = load()
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId]
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next.includes(productId)
}
`

const PRODUCT_PAGE = `import { AddToCartButton } from '../components/AddToCartButton'
import { WishlistButton } from '../components/WishlistButton'
import { formatPrice } from '../lib/cart'
import type { Product } from '../lib/types'

export function ProductPage({ product }: { product: Product }) {
  return (
    <main className="product">
      <img src={product.image} alt={product.name} />
      <h1>{product.name}</h1>
      <p className="price">{formatPrice(product.price)}</p>
      <p>{product.description}</p>
      <div className="actions">
        <AddToCartButton product={product} />
        <WishlistButton productId={product.id} />
      </div>
    </main>
  )
}
`

const CART_TEST = `import { describe, expect, it } from 'vitest'
import { cartTotal } from './cart'

const shirt = { id: 'shirt', name: 'Shirt', price: 40, quantity: 1 }

describe('cartTotal', () => {
  it('adds up line items', () => {
    expect(cartTotal([shirt, { ...shirt, id: 'cap', price: 20 }])).toBe(60)
  })

  it('takes 10% off orders over 100', () => {
    expect(cartTotal([{ ...shirt, quantity: 3 }])).toBe(108)
  })

  it('never goes below zero with a coupon', () => {
    expect(cartTotal([shirt], { coupon: 50 })).toBe(0)
  })
})
`

const RETRY = `const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 30_000
const MAX_ATTEMPTS = 6

/** Delay before retry \`attempt\` (1-based): exponential backoff with full jitter. */
export function retryDelay(attempt: number, random = Math.random): number {
  const ceiling = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1))
  return Math.round(random() * ceiling)
}

export function shouldRetry(attempt: number, status: number): boolean {
  return attempt < MAX_ATTEMPTS && (status === 429 || status >= 500)
}
`

const DOCS_PAGE = `# Wishlist API

Shoppers can save products for later. Saved items live in the browser until they sign in,
then sync to their account.

## Endpoints

| Method | Path                     | What it does                   |
| ------ | ------------------------ | ------------------------------ |
| GET    | /api/wishlist            | List the shopper's saved items |
| PUT    | /api/wishlist/:productId | Save a product                 |
| DELETE | /api/wishlist/:productId | Remove a product               |
`

export const AGENT_SCRIPTS = {
  'web:claude': [
    ['say', "I'll add a wishlist button next to Add to cart."],
    ['print', tool('Read', 'src/pages/ProductPage.tsx')],
    ['pause', 500],
    ['print', tool('Read', 'src/components/AddToCartButton.tsx')],
    ['pause', 600],
    ['write', 'src/lib/wishlist.ts', WISHLIST_LIB],
    ['print', tool('Write', `src/lib/wishlist.ts ${diffStat(19)}`)],
    ['pause', 700],
    ['write', 'src/components/WishlistButton.tsx', WISHLIST_BUTTON],
    ['print', tool('Write', `src/components/WishlistButton.tsx ${diffStat(20)}`)],
    ['pause', 600],
    ['write', 'src/pages/ProductPage.tsx', PRODUCT_PAGE],
    ['print', tool('Update', `src/pages/ProductPage.tsx ${diffStat(5, 1)}`)],
    ['pause', 500],
    ['say', 'Now running the tests.'],
    ['ask', 'Run npm test?'],
    ['print', tool('Bash', 'npm test')],
    ['pause', 900],
    ['print', `  ${dim('✓ 14 passed')} ${dim('(1.2s)')}`],
    ['stop', 'Added a "Save for later" button to the product page.'],
  ],
  'web:codex': [
    ['say', 'Looking at the discount rules in cart.ts.'],
    ['print', tool('Read', 'src/lib/cart.ts')],
    ['pause', 1200],
    ['write', 'src/lib/cart.test.ts', CART_TEST],
    ['print', tool('Edit', `src/lib/cart.test.ts ${diffStat(8)}`)],
    ['pause', 900],
    ['print', tool('Run', 'npx vitest run src/lib/cart.test.ts')],
    ['pause', 1400],
    ['print', `  ${dim('✓ 3 passed')}`],
    ['stop', 'Covered the bulk discount and coupon floor with tests.'],
  ],
  'api:codex': [
    ['pause', 1500],
    ['say', 'Webhook retries use a fixed delay; switching to exponential backoff.'],
    ['print', tool('Read', 'src/webhooks/retry.ts')],
    ['write', 'src/webhooks/retry.ts', RETRY],
    ['print', tool('Edit', `src/webhooks/retry.ts ${diffStat(8, 5)}`)],
    ['print', tool('Run', 'npm test')],
    ['print', `  ${dim('✓ 31 passed')}`],
    ['stop', 'Retries now back off exponentially with jitter, capped at 30s.'],
  ],
  'docs:claude': [
    ['say', 'Drafting the wishlist API page from the storefront routes.'],
    ['print', tool('Read', 'docs/api/index.md')],
    ['write', 'docs/api/wishlist.md', DOCS_PAGE],
    ['print', tool('Write', `docs/api/wishlist.md ${diffStat(12)}`)],
    ['ask', 'Fetch https://staging.example.com/api/wishlist to check the response shape?'],
    ['stop', 'Documented the wishlist API.'],
  ],
}
