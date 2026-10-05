import type { DugoutApi } from '@shared/api'

declare global {
  interface Window {
    readonly dugout: DugoutApi
  }
}
