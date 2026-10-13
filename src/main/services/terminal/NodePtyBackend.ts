import * as pty from 'node-pty'
import type { SpawnOptions, TerminalBackend, TerminalProcess } from './TerminalBackend'

export class NodePtyBackend implements TerminalBackend {
  spawn(options: SpawnOptions): TerminalProcess {
    const ptyProcess = pty.spawn(options.file, [...options.args], {
      name: 'xterm-256color',
      cwd: options.cwd,
      env: { ...options.env },
      cols: options.cols,
      rows: options.rows,
    })

    return {
      pid: ptyProcess.pid,
      onData: (listener) => ptyProcess.onData(listener),
      onExit: (listener) =>
        ptyProcess.onExit(({ exitCode, signal }) =>
          listener(signal ? { exitCode, signal } : { exitCode }),
        ),
      write: (data) => ptyProcess.write(data),
      resize: (cols, rows) => ptyProcess.resize(cols, rows),
      kill: () => ptyProcess.kill(),
      pause: () => ptyProcess.pause(),
      resume: () => ptyProcess.resume(),
    }
  }
}
