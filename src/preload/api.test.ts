import type { IpcRendererEvent } from 'electron'
import { describe, expect, test, vi } from 'vitest'
import type { DugoutApi } from '@shared/api'
import { IpcChannel } from '@shared/ipc/channels'
import { createDugoutApi, type IpcRendererLike } from './api'

type Listener = (event: IpcRendererEvent, ...args: unknown[]) => void

/** A fake `ipcRenderer` that records calls and keeps real listener bookkeeping. */
function fakeIpcRenderer() {
  const listeners = new Map<string, Set<Listener>>()
  const ipc = {
    invoke: vi.fn(async () => ({ ok: true, data: 'reply' })),
    send: vi.fn(() => {}),
    on: vi.fn((channel: string, listener: Listener) => {
      listeners.set(channel, new Set([...(listeners.get(channel) ?? []), listener]))
      return ipc
    }),
    removeListener: vi.fn((channel: string, listener: Listener) => {
      listeners.set(
        channel,
        new Set([...(listeners.get(channel) ?? [])].filter((known) => known !== listener)),
      )
      return ipc
    }),
  }
  const emit = (channel: string, ...args: unknown[]) => {
    for (const listener of listeners.get(channel) ?? []) listener({} as IpcRendererEvent, ...args)
  }
  const count = (channel: string) => listeners.get(channel)?.size ?? 0
  return { ipc, emit, count }
}

function setup() {
  const fake = fakeIpcRenderer()
  const api = createDugoutApi(fake.ipc as unknown as IpcRendererLike)
  return { ...fake, api }
}

type AnyMethod = (...args: unknown[]) => unknown

function methodAt(api: DugoutApi, path: string): AnyMethod {
  const value = path
    .split('.')
    .reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], api)
  return value as AnyMethod
}

/** Every method path in the API object, e.g. "git.status". */
function methodPaths(node: object, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) =>
    typeof value === 'function'
      ? [`${prefix}${key}`]
      : methodPaths(value as object, `${prefix}${key}.`),
  )
}

const P = 'p1'
const CHECKOUT = { projectId: P, worktreePath: '/worktrees/p1/feature' }
const URL_ = 'https://github.com/acme/demo/pull/7'

interface Row {
  readonly method: string
  readonly args: unknown[]
  readonly channel: string
  readonly payload: unknown[]
  readonly kind?: 'send'
}

const requests: Row[] = [
  {
    method: 'terminal.create',
    args: [{ kind: 'shell' }],
    channel: IpcChannel.terminalCreate,
    payload: [{ kind: 'shell' }],
  },
  {
    method: 'terminal.write',
    args: ['t1', 'ls\r'],
    channel: IpcChannel.terminalWrite,
    payload: [{ id: 't1', data: 'ls\r' }],
    kind: 'send',
  },
  {
    method: 'terminal.resize',
    args: ['t1', 80, 24],
    channel: IpcChannel.terminalResize,
    payload: [{ id: 't1', cols: 80, rows: 24 }],
    kind: 'send',
  },
  {
    method: 'terminal.kill',
    args: ['t1'],
    channel: IpcChannel.terminalKill,
    payload: [{ id: 't1' }],
    kind: 'send',
  },
  {
    method: 'terminal.pause',
    args: ['t1'],
    channel: IpcChannel.terminalPause,
    payload: [{ id: 't1' }],
    kind: 'send',
  },
  {
    method: 'terminal.resume',
    args: ['t1'],
    channel: IpcChannel.terminalResume,
    payload: [{ id: 't1' }],
    kind: 'send',
  },
  {
    method: 'terminal.withheldServers',
    args: ['t1'],
    channel: IpcChannel.terminalWithheldServers,
    payload: [{ id: 't1' }],
  },
  { method: 'projects.list', args: [], channel: IpcChannel.projectList, payload: [] },
  {
    method: 'projects.add',
    args: [{ rootPath: '/r' }],
    channel: IpcChannel.projectAdd,
    payload: [{ rootPath: '/r' }],
  },
  { method: 'projects.remove', args: [P], channel: IpcChannel.projectRemove, payload: [{ id: P }] },
  {
    method: 'projects.setDevCommand',
    args: [P, 'npm run dev'],
    channel: IpcChannel.projectSetDevCommand,
    payload: [{ id: P, command: 'npm run dev' }],
  },
  {
    method: 'projects.setCheckCommand',
    args: [P, null],
    channel: IpcChannel.projectSetCheckCommand,
    payload: [{ id: P, command: null }],
  },
  {
    method: 'projects.setTaskSource',
    args: [P, { kind: 'github' }],
    channel: IpcChannel.projectSetTaskSource,
    payload: [{ projectId: P, source: { kind: 'github' } }],
  },
  {
    method: 'projects.setWorktreeSetup',
    args: [P, null],
    channel: IpcChannel.projectSetWorktreeSetup,
    payload: [{ id: P, setup: null }],
  },
  {
    method: 'projects.changeTaskQueue',
    args: [P, { kind: 'remove', number: 3 }],
    channel: IpcChannel.projectChangeTaskQueue,
    payload: [{ id: P, change: { kind: 'remove', number: 3 } }],
  },
  {
    method: 'projects.setMaxAgents',
    args: [P, 2],
    channel: IpcChannel.projectSetMaxAgents,
    payload: [{ id: P, maxAgents: 2 }],
  },
  {
    method: 'preview.deployment',
    args: [CHECKOUT],
    channel: IpcChannel.previewDeployment,
    payload: [CHECKOUT],
  },
  {
    method: 'preview.assignPort',
    args: [[4100]],
    channel: IpcChannel.previewAssignPort,
    payload: [{ reserved: [4100] }],
  },
  {
    method: 'preview.openUrl',
    args: [URL_],
    channel: IpcChannel.previewOpenUrl,
    payload: [{ url: URL_ }],
  },
  { method: 'git.status', args: [CHECKOUT], channel: IpcChannel.gitStatus, payload: [CHECKOUT] },
  {
    method: 'git.show',
    args: [CHECKOUT, 'a.ts', 'HEAD'],
    channel: IpcChannel.gitShow,
    payload: [{ ...CHECKOUT, path: 'a.ts', revision: 'HEAD' }],
  },
  {
    method: 'git.stage',
    args: [CHECKOUT, ['a.ts']],
    channel: IpcChannel.gitStage,
    payload: [{ ...CHECKOUT, paths: ['a.ts'] }],
  },
  {
    method: 'git.unstage',
    args: [CHECKOUT, ['a.ts']],
    channel: IpcChannel.gitUnstage,
    payload: [{ ...CHECKOUT, paths: ['a.ts'] }],
  },
  {
    method: 'git.discard',
    args: [CHECKOUT, ['a.ts']],
    channel: IpcChannel.gitDiscard,
    payload: [{ ...CHECKOUT, paths: ['a.ts'] }],
  },
  {
    method: 'git.commit',
    args: [CHECKOUT, 'msg', { includeAll: true }],
    channel: IpcChannel.gitCommit,
    payload: [{ ...CHECKOUT, message: 'msg', includeAll: true }],
  },
  { method: 'git.fetch', args: [CHECKOUT], channel: IpcChannel.gitFetch, payload: [CHECKOUT] },
  { method: 'git.push', args: [CHECKOUT], channel: IpcChannel.gitPush, payload: [CHECKOUT] },
  {
    method: 'git.openPullRequest',
    args: [CHECKOUT],
    channel: IpcChannel.gitOpenPullRequest,
    payload: [CHECKOUT],
  },
  {
    method: 'git.pullRequestStatus',
    args: [CHECKOUT],
    channel: IpcChannel.gitPullRequestStatus,
    payload: [CHECKOUT],
  },
  {
    method: 'git.pullRequestReviewThreads',
    args: [CHECKOUT, 7],
    channel: IpcChannel.gitPullRequestReviewThreads,
    payload: [{ ...CHECKOUT, number: 7 }],
  },
  {
    method: 'git.pullRequestFailingChecks',
    args: [CHECKOUT, 7],
    channel: IpcChannel.gitPullRequestFailingChecks,
    payload: [{ ...CHECKOUT, number: 7 }],
  },
  { method: 'git.openUrl', args: [URL_], channel: IpcChannel.gitOpenUrl, payload: [{ url: URL_ }] },
  {
    method: 'git.branches',
    args: [CHECKOUT],
    channel: IpcChannel.gitBranches,
    payload: [CHECKOUT],
  },
  {
    method: 'git.switchBranch',
    args: [CHECKOUT, { kind: 'local', name: 'x' }],
    channel: IpcChannel.gitSwitchBranch,
    payload: [{ ...CHECKOUT, kind: 'local', name: 'x' }],
  },
  {
    method: 'git.createBranch',
    args: [CHECKOUT, 'x', 'main'],
    channel: IpcChannel.gitCreateBranch,
    payload: [{ ...CHECKOUT, name: 'x', startPoint: 'main' }],
  },
  {
    method: 'worktrees.list',
    args: [P],
    channel: IpcChannel.worktreeList,
    payload: [{ projectId: P }],
  },
  {
    method: 'worktrees.create',
    args: [P],
    channel: IpcChannel.worktreeCreate,
    payload: [{ projectId: P }],
  },
  {
    method: 'worktrees.remove',
    args: [P, '/w'],
    channel: IpcChannel.worktreeRemove,
    payload: [{ projectId: P, path: '/w' }],
  },
  {
    method: 'files.readDir',
    args: [CHECKOUT, ''],
    channel: IpcChannel.filesReadDir,
    payload: [{ ...CHECKOUT, path: '' }],
  },
  {
    method: 'files.read',
    args: [CHECKOUT, 'a.ts'],
    channel: IpcChannel.filesRead,
    payload: [{ ...CHECKOUT, path: 'a.ts' }],
  },
  {
    method: 'files.stat',
    args: [CHECKOUT, ['a.ts']],
    channel: IpcChannel.filesStat,
    payload: [{ ...CHECKOUT, paths: ['a.ts'] }],
  },
  {
    method: 'files.write',
    args: [CHECKOUT, 'a.ts', 'x', { expectedMtimeMs: 1 }],
    channel: IpcChannel.filesWrite,
    payload: [{ ...CHECKOUT, path: 'a.ts', content: 'x', expectedMtimeMs: 1 }],
  },
  {
    method: 'editor.setHasUnsavedChanges',
    args: [true],
    channel: IpcChannel.editorUnsavedChanges,
    payload: [true],
    kind: 'send',
  },
  { method: 'github.getState', args: [], channel: IpcChannel.authGetState, payload: [] },
  { method: 'github.startSignIn', args: [], channel: IpcChannel.authStart, payload: [] },
  { method: 'github.cancelSignIn', args: [], channel: IpcChannel.authCancel, payload: [] },
  { method: 'github.signOut', args: [], channel: IpcChannel.authSignOut, payload: [] },
  {
    method: 'github.openVerificationPage',
    args: [],
    channel: IpcChannel.authOpenVerification,
    payload: [],
  },
  { method: 'github.retry', args: [], channel: IpcChannel.authRetry, payload: [] },
  { method: 'github.listRepos', args: [], channel: IpcChannel.githubListRepos, payload: [] },
  { method: 'linear.getState', args: [], channel: IpcChannel.linearGetState, payload: [] },
  {
    method: 'linear.connect',
    args: ['lin_key'],
    channel: IpcChannel.linearConnect,
    payload: [{ apiKey: 'lin_key' }],
  },
  { method: 'linear.disconnect', args: [], channel: IpcChannel.linearDisconnect, payload: [] },
  { method: 'linear.listTeams', args: [], channel: IpcChannel.linearListTeams, payload: [] },
  { method: 'clone.defaults', args: [], channel: IpcChannel.cloneDefaults, payload: [] },
  {
    method: 'clone.start',
    args: [{ url: 'u' }],
    channel: IpcChannel.cloneStart,
    payload: [{ url: 'u' }],
  },
  { method: 'clone.cancel', args: [], channel: IpcChannel.cloneCancel, payload: [], kind: 'send' },
  { method: 'settings.get', args: [], channel: IpcChannel.settingsGet, payload: [] },
  {
    method: 'settings.update',
    args: [{ defaultAgent: 'codex' }],
    channel: IpcChannel.settingsUpdate,
    payload: [{ defaultAgent: 'codex' }],
  },
  { method: 'openIn.apps', args: [], channel: IpcChannel.openInApps, payload: [] },
  {
    method: 'openIn.open',
    args: [CHECKOUT, 'zed'],
    channel: IpcChannel.openInOpen,
    payload: [{ ...CHECKOUT, app: 'zed' }],
  },
  { method: 'tasks.list', args: [P], channel: IpcChannel.tasksList, payload: [{ projectId: P }] },
  {
    method: 'tasks.get',
    args: [P, 3],
    channel: IpcChannel.tasksGet,
    payload: [{ projectId: P, number: 3 }],
  },
  {
    method: 'tasks.create',
    args: [{ projectId: P, title: 't' }],
    channel: IpcChannel.tasksCreate,
    payload: [{ projectId: P, title: 't' }],
  },
  {
    method: 'tasks.update',
    args: [{ projectId: P, number: 3 }],
    channel: IpcChannel.tasksUpdate,
    payload: [{ projectId: P, number: 3 }],
  },
  {
    method: 'tasks.comment',
    args: [P, 3, 'b'],
    channel: IpcChannel.tasksComment,
    payload: [{ projectId: P, number: 3, body: 'b' }],
  },
  {
    method: 'tasks.openInBrowser',
    args: [P, 3],
    channel: IpcChannel.tasksOpen,
    payload: [{ projectId: P, number: 3 }],
  },
  {
    method: 'tasks.startSession',
    args: [P, 3, ['claude']],
    channel: IpcChannel.tasksStartSession,
    payload: [{ projectId: P, number: 3, agents: ['claude'] }],
  },
  {
    method: 'agentConfig.read',
    args: [P],
    channel: IpcChannel.agentConfigRead,
    payload: [{ projectId: P }],
  },
  {
    method: 'agentConfig.approveServers',
    args: [P, 'abc'],
    channel: IpcChannel.agentConfigApproveServers,
    payload: [{ projectId: P, hash: 'abc' }],
  },
  {
    method: 'agentConfig.saveMcp',
    args: [P, [], 'v1'],
    channel: IpcChannel.agentConfigSaveMcp,
    payload: [{ projectId: P, servers: [], version: 'v1' }],
  },
  {
    method: 'agentConfig.linkInstructions',
    args: [P],
    channel: IpcChannel.agentConfigLinkInstructions,
    payload: [{ projectId: P }],
  },
  {
    method: 'context.read',
    args: [P],
    channel: IpcChannel.contextRead,
    payload: [{ projectId: P }],
  },
  {
    method: 'context.add',
    args: [P, { kind: 'note' }],
    channel: IpcChannel.contextAdd,
    payload: [{ projectId: P, entry: { kind: 'note' } }],
  },
  {
    method: 'context.edit',
    args: [P, { id: 'n', title: 't', body: 'b' }],
    channel: IpcChannel.contextEdit,
    payload: [{ projectId: P, id: 'n', title: 't', body: 'b' }],
  },
  {
    method: 'context.remove',
    args: [P, 'n'],
    channel: IpcChannel.contextRemove,
    payload: [{ projectId: P, id: 'n' }],
  },
  {
    method: 'context.repin',
    args: [P, 'n'],
    channel: IpcChannel.contextRepin,
    payload: [{ projectId: P, id: 'n' }],
  },
  {
    method: 'context.approve',
    args: [P, 'n'],
    channel: IpcChannel.contextApprove,
    payload: [{ projectId: P, id: 'n' }],
  },
  {
    method: 'context.discard',
    args: [P, 'n'],
    channel: IpcChannel.contextDiscard,
    payload: [{ projectId: P, id: 'n' }],
  },
  {
    method: 'context.importDoc',
    args: [P, 'shared'],
    channel: IpcChannel.contextImportDoc,
    payload: [{ projectId: P, scope: 'shared' }],
  },
  {
    method: 'context.buildCodemap',
    args: [P, 'claude'],
    channel: IpcChannel.contextBuildCodemap,
    payload: [{ projectId: P, agent: 'claude' }],
  },
  {
    method: 'compare.changes',
    args: [P, ['/a', '/b']],
    channel: IpcChannel.compareChanges,
    payload: [{ projectId: P, worktreePaths: ['/a', '/b'] }],
  },
  {
    method: 'usage.project',
    args: [P],
    channel: IpcChannel.usageProject,
    payload: [{ projectId: P }],
  },
  {
    method: 'timeline.session',
    args: ['claude', 's1'],
    channel: IpcChannel.timelineSession,
    payload: [{ agent: 'claude', sessionId: 's1' }],
  },
  { method: 'workspace.load', args: [], channel: IpcChannel.workspaceLoad, payload: [] },
  {
    method: 'workspace.save',
    args: [{ version: 1 }],
    channel: IpcChannel.workspaceSave,
    payload: [{ version: 1 }],
  },
  {
    method: 'welcome.findRepos',
    args: ['common'],
    channel: IpcChannel.welcomeFindRepos,
    payload: ['common'],
  },
  { method: 'welcome.checkAgents', args: [], channel: IpcChannel.welcomeCheckAgents, payload: [] },
  { method: 'dialog.pickFolder', args: [], channel: IpcChannel.dialogPickFolder, payload: [] },
]

const subscriptions: { readonly method: string; readonly channel: string }[] = [
  { method: 'terminal.onData', channel: IpcChannel.terminalData },
  { method: 'terminal.onExit', channel: IpcChannel.terminalExit },
  { method: 'terminal.onAgentStatus', channel: IpcChannel.terminalAgentStatus },
  { method: 'terminal.onAgentSession', channel: IpcChannel.terminalAgentSession },
  { method: 'terminal.onAgentSubagent', channel: IpcChannel.terminalAgentSubagent },
  { method: 'terminal.onCheckStatus', channel: IpcChannel.terminalCheckStatus },
  { method: 'terminal.onAgentUsage', channel: IpcChannel.terminalAgentUsage },
  { method: 'github.onStateChange', channel: IpcChannel.authState },
  { method: 'clone.onProgress', channel: IpcChannel.cloneProgress },
  { method: 'context.onChange', channel: IpcChannel.contextChanged },
  { method: 'usage.onChange', channel: IpcChannel.usageChanged },
  { method: 'onCommand', channel: IpcChannel.appCommand },
]

describe('createDugoutApi', () => {
  test('covers every DugoutApi method in these tables', () => {
    // Arrange
    const { api } = setup()

    // Act
    const paths = methodPaths(api).sort()

    // Assert
    expect(paths).toEqual(
      [...requests.map((row) => row.method), ...subscriptions.map((row) => row.method)].sort(),
    )
  })

  test.each(requests.filter((row) => row.kind !== 'send'))(
    '$method invokes $channel and returns its reply',
    async ({ method, args, channel, payload }) => {
      // Arrange
      const { api, ipc } = setup()

      // Act
      const reply = await methodAt(api, method)(...args)

      // Assert
      expect(ipc.invoke).toHaveBeenCalledExactlyOnceWith(channel, ...payload)
      expect(ipc.send).not.toHaveBeenCalled()
      expect(reply).toEqual({ ok: true, data: 'reply' })
    },
  )

  test.each(requests.filter((row) => row.kind === 'send'))(
    '$method sends $channel without waiting for a reply',
    ({ method, args, channel, payload }) => {
      // Arrange
      const { api, ipc } = setup()

      // Act
      methodAt(api, method)(...args)

      // Assert
      expect(ipc.send).toHaveBeenCalledExactlyOnceWith(channel, ...payload)
      expect(ipc.invoke).not.toHaveBeenCalled()
    },
  )

  test('reports unsaved changes as a strict boolean', () => {
    // Arrange
    const { api, ipc } = setup()

    // Act
    api.editor.setHasUnsavedChanges('yes' as unknown as boolean)

    // Assert
    expect(ipc.send).toHaveBeenCalledWith(IpcChannel.editorUnsavedChanges, false)
  })

  test.each(subscriptions)(
    '$method passes $channel events to the listener, without the IPC event',
    ({ method, channel }) => {
      // Arrange
      const { api, emit } = setup()
      const listener = vi.fn()
      methodAt(api, method)(listener)

      // Act
      emit(channel, 'first', 2)

      // Assert
      expect(listener).toHaveBeenCalledExactlyOnceWith('first', 2)
    },
  )

  test.each(subscriptions)(
    '$method returns an unsubscribe that removes only its own listener',
    ({ method, channel }) => {
      // Arrange
      const { api, emit, count } = setup()
      const kept = vi.fn()
      const removed = vi.fn()
      methodAt(api, method)(kept)
      const unsubscribe = methodAt(api, method)(removed) as () => void

      // Act
      unsubscribe()
      emit(channel, 'after')

      // Assert
      expect(count(channel)).toBe(1)
      expect(kept).toHaveBeenCalledWith('after')
      expect(removed).not.toHaveBeenCalled()
    },
  )
})
