import type { DugoutApi } from '@shared/api'

/** Typed access to the preload bridge. Import this instead of touching `window` directly. */
export const dugout: DugoutApi = window.dugout
