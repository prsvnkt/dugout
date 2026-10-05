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
  terminalAgentSession: 'terminal:agent-session',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
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
  worktreeList: 'worktree:list',
  worktreeCreate: 'worktree:create',
  worktreeRemove: 'worktree:remove',
  appCommand: 'app:command',
} as const
