import { create } from 'zustand'

/** A viewable text file (Markdown, SVG) shows its preview or its source in Monaco. */
export type ViewerMode = 'preview' | 'source'

interface ViewerModeState {
  /** By file key; a file not listed shows its preview. */
  readonly modes: Readonly<Record<string, ViewerMode>>
  setMode(fileKey: string, mode: ViewerMode): void
}

/** Remembers each file's Preview / Source choice while the app runs, across tab switches. */
export const useViewerModeStore = create<ViewerModeState>()((set) => ({
  modes: {},
  setMode: (fileKey, mode) =>
    set((state) =>
      (state.modes[fileKey] ?? 'preview') === mode
        ? state
        : { modes: { ...state.modes, [fileKey]: mode } },
    ),
}))

export function useViewerMode(fileKey: string): ViewerMode {
  return useViewerModeStore((state) => state.modes[fileKey] ?? 'preview')
}
