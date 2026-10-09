import { Menu, type MenuItemConstructorOptions } from 'electron'
import { AGENT_LIST, NEW_AGENT_SHORTCUT, NEW_WORKTREE_AGENT_SHORTCUT } from '@shared/agents'
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
 * ⌘T starts the default agent (chosen on the start screen); every agent also has its own item.
 * Per-agent shortcuts would run out of keys as agents are added (decision 037).
 */
function newAgentItems(send: (command: AppCommand) => void): MenuItemConstructorOptions[] {
  return [
    {
      label: 'New Agent',
      accelerator: NEW_AGENT_SHORTCUT.accelerator,
      click: () => send({ type: 'pane.newDefaultAgent' }),
    },
    ...AGENT_LIST.map((agent) => ({
      label: `New ${agent.label} Agent`,
      click: () => send({ type: 'pane.new', kind: agent.kind }),
    })),
    {
      label: 'New Agent in Worktree',
      accelerator: NEW_WORKTREE_AGENT_SHORTCUT.accelerator,
      click: () => send({ type: 'pane.newWorktree' }),
    },
  ]
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
        ...newAgentItems(send),
        {
          label: 'New Shell',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => send({ type: 'pane.new', kind: 'shell' }),
        },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send({ type: 'editor.save' }) },
        {
          label: 'Save All',
          accelerator: 'Alt+CmdOrCtrl+S',
          click: () => send({ type: 'editor.saveAll' }),
        },
        {
          label: 'Close Tab, Agent or Shell',
          accelerator: 'CmdOrCtrl+W',
          click: () => send({ type: 'pane.close' }),
        },
        { type: 'separator' },
        {
          label: 'Clone Repository…',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: () => send({ type: 'project.clone' }),
        },
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
          label: 'Show Inbox',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => send({ type: 'inbox.toggle' }),
        },
        {
          label: 'Agent Settings',
          accelerator: 'CmdOrCtrl+Shift+,',
          click: () => send({ type: 'agentSettings.open' }),
        },
        {
          label: 'Toggle Explorer',
          accelerator: 'CmdOrCtrl+B',
          click: () => send({ type: 'explorer.toggle' }),
        },
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
