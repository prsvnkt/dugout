import { Menu, type MenuItemConstructorOptions } from 'electron'
import type { AppCommand } from '@shared/commands'

const PROJECT_SHORTCUT_COUNT = 9

function projectShortcuts(send: (command: AppCommand) => void): MenuItemConstructorOptions[] {
  return Array.from({ length: PROJECT_SHORTCUT_COUNT }, (_, index) => ({
    label: `Project ${index + 1}`,
    accelerator: `CmdOrCtrl+${index + 1}`,
    click: () => send({ type: 'project.select', index }),
  }))
}

/**
 * Native menu. Shortcuts live here (not in renderer key handlers) so they work while a
 * terminal has focus and are discoverable in the menu bar. ⌘W closes a pane, not the window.
 */
export function buildMenuTemplate(
  send: (command: AppCommand) => void,
  isDev: boolean,
): MenuItemConstructorOptions[] {
  return [
    { role: 'appMenu' },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Claude Pane',
          accelerator: 'CmdOrCtrl+T',
          click: () => send({ type: 'pane.new', kind: 'claude' }),
        },
        {
          label: 'New Shell Pane',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => send({ type: 'pane.new', kind: 'shell' }),
        },
        {
          label: 'Close Pane',
          accelerator: 'CmdOrCtrl+W',
          click: () => send({ type: 'pane.close' }),
        },
        { type: 'separator' },
        {
          label: 'Add Project…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => send({ type: 'project.add' }),
        },
        { type: 'separator' },
        { role: 'close', accelerator: 'CmdOrCtrl+Shift+W' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Git Panel',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => send({ type: 'git.togglePanel' }),
        },
        { type: 'separator' },
        ...(isDev ? [{ role: 'reload' as const }, { role: 'toggleDevTools' as const }] : []),
        { role: 'togglefullscreen' },
      ],
    },
    { label: 'Projects', submenu: projectShortcuts(send) },
    { role: 'windowMenu' },
  ]
}

export function installMenu(send: (command: AppCommand) => void, isDev: boolean): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate(send, isDev)))
}
