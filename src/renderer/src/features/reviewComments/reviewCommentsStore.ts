import { create } from 'zustand'
import type { ProjectId } from '@shared/project'
import type { CommentContent, CommentedLines } from './reviewPrompt'

/** Which checkout a comment is on: the agent working there is the one that gets it. */
export interface CommentCheckout {
  readonly projectId: ProjectId
  /** A worktree path, or null for the project's main checkout. */
  readonly worktreePath: string | null
}

/** Lines picked in a diff, waiting for the comment text. */
export type CommentDraft = CommentCheckout & CommentedLines

export interface ReviewComment extends CommentCheckout, CommentContent {
  readonly id: string
}

interface ReviewCommentsState {
  /** Pending comments, oldest first. Renderer state only: never written to the repo. */
  readonly comments: readonly ReviewComment[]
  /** At most one comment is being written at a time. */
  readonly draft: CommentDraft | null
  startDraft(draft: CommentDraft): void
  cancelDraft(): void
  /** Turns the draft into a pending comment; empty text keeps the draft open. */
  saveDraft(text: string): void
  remove(id: string): void
  /** Drops comments once they have been delivered. */
  removeAll(ids: readonly string[]): void
}

export function isSameCheckout(a: CommentCheckout, b: CommentCheckout): boolean {
  return a.projectId === b.projectId && a.worktreePath === b.worktreePath
}

export const useReviewCommentsStore = create<ReviewCommentsState>()((set, get) => ({
  comments: [],
  draft: null,
  startDraft: (draft) => set({ draft }),
  cancelDraft: () => set({ draft: null }),
  saveDraft: (text) => {
    const { draft } = get()
    if (!draft || !text.trim()) return
    const comment: ReviewComment = { ...draft, id: crypto.randomUUID(), text: text.trim() }
    set((state) => ({ comments: [...state.comments, comment], draft: null }))
  },
  remove: (id) => set((state) => ({ comments: state.comments.filter((c) => c.id !== id) })),
  removeAll: (ids) =>
    set((state) => ({ comments: state.comments.filter((c) => !ids.includes(c.id)) })),
}))
