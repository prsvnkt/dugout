import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Files of a sample repo, committed in order: one commit per entry. */
type Commit = { readonly message: string; readonly files: Readonly<Record<string, string>> }

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Demo',
  GIT_AUTHOR_EMAIL: 'demo@example.com',
  GIT_COMMITTER_NAME: 'Demo',
  GIT_COMMITTER_EMAIL: 'demo@example.com',
}

const packageJson = (name: string) =>
  JSON.stringify({ name, private: true, scripts: { test: 'vitest run' } }, null, 2) + '\n'

const STOREFRONT: readonly Commit[] = [
  {
    message: 'chore: scaffold storefront',
    files: {
      'package.json': packageJson('storefront'),
      'README.md': '# Storefront\n\nThe shop front end: product pages, cart and checkout.\n',
      'src/lib/types.ts': `export interface Product {
  id: string
  name: string
  description: string
  image: string
  price: number
}
`,
    },
  },
  {
    message: 'feat: cart with bulk discount',
    files: {
      'src/lib/cart.ts': `export interface LineItem {
  id: string
  name: string
  price: number
  quantity: number
}

const BULK_THRESHOLD = 100
const BULK_DISCOUNT = 0.1

export function cartTotal(items: LineItem[], options: { coupon?: number } = {}): number {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const discounted = subtotal > BULK_THRESHOLD ? subtotal * (1 - BULK_DISCOUNT) : subtotal
  return Math.max(0, discounted - (options.coupon ?? 0))
}

export const formatPrice = (amount: number) => \`$\${amount.toFixed(2)}\`
`,
      'src/lib/cart.test.ts': `import { describe, expect, it } from 'vitest'
import { cartTotal } from './cart'

const shirt = { id: 'shirt', name: 'Shirt', price: 40, quantity: 1 }

describe('cartTotal', () => {
  it('adds up line items', () => {
    expect(cartTotal([shirt, { ...shirt, id: 'cap', price: 20 }])).toBe(60)
  })
})
`,
    },
  },
  {
    message: 'feat: product page',
    files: {
      'src/components/AddToCartButton.tsx': `import type { Product } from '../lib/types'

export function AddToCartButton({ product }: { product: Product }) {
  return <button className="primary">Add {product.name} to cart</button>
}
`,
      'src/pages/ProductPage.tsx': `import { AddToCartButton } from '../components/AddToCartButton'
import { formatPrice } from '../lib/cart'
import type { Product } from '../lib/types'

export function ProductPage({ product }: { product: Product }) {
  return (
    <main className="product">
      <img src={product.image} alt={product.name} />
      <h1>{product.name}</h1>
      <p className="price">{formatPrice(product.price)}</p>
      <p>{product.description}</p>
      <AddToCartButton product={product} />
    </main>
  )
}
`,
    },
  },
]

const PAYMENTS_API: readonly Commit[] = [
  {
    message: 'chore: scaffold payments api',
    files: {
      'package.json': packageJson('payments-api'),
      'README.md': '# Payments API\n\nCharges, refunds and webhook delivery.\n',
      'src/server.ts': `import { createServer } from 'node:http'
import { handleWebhook } from './webhooks/handler'

createServer(handleWebhook).listen(Number(process.env.PORT ?? 4000))
`,
    },
  },
  {
    message: 'feat: retry failed webhook deliveries',
    files: {
      'src/webhooks/handler.ts': `import type { IncomingMessage, ServerResponse } from 'node:http'

export function handleWebhook(request: IncomingMessage, response: ServerResponse): void {
  response.writeHead(202).end()
}
`,
      'src/webhooks/retry.ts': `const RETRY_DELAY_MS = 1000
const MAX_ATTEMPTS = 3

export function retryDelay(): number {
  return RETRY_DELAY_MS
}

export function shouldRetry(attempt: number, status: number): boolean {
  return attempt < MAX_ATTEMPTS && status >= 500
}
`,
    },
  },
]

const DOCS_SITE: readonly Commit[] = [
  {
    message: 'docs: getting started',
    files: {
      'package.json': packageJson('docs-site'),
      'README.md': '# Docs site\n\nPublic developer documentation.\n',
      'docs/getting-started.md':
        '# Getting started\n\nCreate an API key, then call `/api/products`.\n',
      'docs/api/index.md': '# API reference\n\n- [Products](products.md)\n- [Orders](orders.md)\n',
    },
  },
]

/** Short names, so the project tabs show them in full next to a status. */
const PROJECTS = { web: STOREFRONT, api: PAYMENTS_API, docs: DOCS_SITE }
export type DemoProjectName = keyof typeof PROJECTS

function commitAll(repo: string, commit: Commit): void {
  for (const [path, content] of Object.entries(commit.files)) {
    mkdirSync(dirname(join(repo, path)), { recursive: true })
    writeFileSync(join(repo, path), content)
  }
  execFileSync('git', ['add', '-A'], { cwd: repo, env: GIT_ENV })
  execFileSync('git', ['commit', '-q', '-m', commit.message], { cwd: repo, env: GIT_ENV })
}

/** Creates the sample repo `name` inside `parent` and returns its path. */
export function createDemoProject(parent: string, name: DemoProjectName): string {
  const repo = join(parent, name)
  mkdirSync(repo)
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: repo })
  for (const commit of PROJECTS[name]) commitAll(repo, commit)
  return repo
}
