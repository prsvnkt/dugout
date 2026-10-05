/**
 * Every IPC channel between main and renderer. Kept dependency-free because the
 * sandboxed preload script imports it and cannot `require` npm packages.
 */
export const IpcChannel = {
  terminalCreate: 'terminal:create',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalKill: 'terminal:kill',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  dialogPickFolder: 'dialog:pick-folder',
} as const
