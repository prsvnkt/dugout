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
  terminalAgentStatus: 'terminal:agent-status',
  dialogPickFolder: 'dialog:pick-folder',
  projectList: 'project:list',
  projectAdd: 'project:add',
  projectUpdate: 'project:update',
  projectRemove: 'project:remove',
  gitStatus: 'git:status',
  gitDiff: 'git:diff',
  gitStage: 'git:stage',
  gitUnstage: 'git:unstage',
  gitDiscard: 'git:discard',
  gitCommit: 'git:commit',
  gitPush: 'git:push',
  gitOpenPullRequest: 'git:open-pull-request',
  appCommand: 'app:command',
} as const
