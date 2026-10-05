import { create } from 'zustand'
import type { GitHubAuthState } from '@shared/github'
import { dugout } from '@renderer/lib/dugout'

interface AuthStoreState {
  readonly auth: GitHubAuthState
  readonly isDialogOpen: boolean
  readonly startError: string | null
  /** Loads the current state and follows changes pushed from main. */
  connect(): () => void
  /** Opens the sign-in dialog and starts the device flow. */
  signIn(): Promise<void>
  closeDialog(): void
  signOut(): Promise<void>
}

export const useAuthStore = create<AuthStoreState>()((set, get) => ({
  auth: { status: 'signed-out' },
  isDialogOpen: false,
  startError: null,

  connect() {
    void dugout.github.getState().then((result) => {
      if (result.ok) set({ auth: result.data })
    })
    return dugout.github.onStateChange((auth) => {
      set({ auth })
      if (auth.status === 'signed-in') set({ isDialogOpen: false })
    })
  },

  async signIn() {
    set({ isDialogOpen: true, startError: null })
    if (get().auth.status === 'unconfigured') return
    const result = await dugout.github.startSignIn()
    if (!result.ok) set({ startError: result.error })
  },

  closeDialog() {
    if (get().auth.status === 'pending') void dugout.github.cancelSignIn()
    set({ isDialogOpen: false })
  },

  async signOut() {
    await dugout.github.signOut()
  },
}))

const AUTH_FAILURE =
  /authentication failed|could not read username|terminal prompts disabled|invalid username or password|403|sign in again/i

/** True for git errors caused by missing or rejected GitHub credentials. */
export function isAuthError(message: string): boolean {
  return AUTH_FAILURE.test(message)
}
