import type { DugoutApi } from '@shared/api'

/**
 * A fake `window.dugout` for renderer store tests in Node. Import this module before any store
 * (it must run before `@renderer/lib/dugout` reads `window.dugout`), then give each test the
 * methods it needs with `setFakeDugout`.
 */
export type FakeDugout = { -readonly [K in keyof DugoutApi]?: Partial<DugoutApi[K]> }

const fake: Record<string, unknown> = {}

const scope = globalThis as unknown as { window?: { dugout?: unknown } }
if (scope.window) scope.window.dugout = fake
else scope.window = { dugout: fake }

/** Replaces every domain of the fake bridge with `api` (unset domains are undefined). */
export function setFakeDugout(api: FakeDugout): void {
  for (const key of Object.keys(fake)) Reflect.deleteProperty(fake, key)
  Object.assign(fake, api)
}
