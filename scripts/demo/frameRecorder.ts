import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page } from '@playwright/test'

/** How long the last frame stays on screen before the GIF loops. */
const FINAL_FRAME_SECONDS = 2

interface Frame {
  readonly file: string
  readonly at: number
}

/**
 * Screenshots the page back to back while a demo plays, then writes an ffmpeg concat list
 * (`frames.txt`) that gives every frame its real on-screen duration.
 */
export class FrameRecorder {
  private frames: readonly Frame[] = []
  private running: Promise<void> | undefined
  private isRecording = false

  constructor(
    private readonly page: Page,
    private readonly dir: string,
  ) {}

  start(): void {
    rmSync(this.dir, { recursive: true, force: true })
    mkdirSync(this.dir, { recursive: true })
    this.isRecording = true
    this.running = this.loop()
  }

  async stop(): Promise<void> {
    this.isRecording = false
    await this.running
    const lines = this.frames.flatMap((frame, i) => {
      const next = this.frames[i + 1]
      const seconds = next ? (next.at - frame.at) / 1000 : FINAL_FRAME_SECONDS
      return [`file '${frame.file}'`, `duration ${seconds.toFixed(3)}`]
    })
    // The concat demuxer ignores the last duration unless the last file is listed again.
    const last = this.frames.at(-1)
    writeFileSync(join(this.dir, 'frames.txt'), [...lines, `file '${last?.file}'`, ''].join('\n'))
  }

  private async loop(): Promise<void> {
    while (this.isRecording) {
      const file = `${String(this.frames.length).padStart(5, '0')}.png`
      const at = Date.now()
      await this.page.screenshot({ path: join(this.dir, file) })
      this.frames = [...this.frames, { file, at }]
    }
  }
}
