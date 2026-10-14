import { join } from 'node:path'
import type { GitService } from '../services/git/GitService'
import { LinearAuth } from '../services/linear/LinearAuth'
import { linearConfig } from '../services/linear/linearConfig'
import { LinearIssues } from '../services/linear/LinearIssues'
import { LinearKeyStore } from '../services/linear/LinearKeyStore'
import type { ProjectStore } from '../services/projects/ProjectStore'
import { GitHubIssues } from '../services/tasks/GitHubIssues'
import { TaskService } from '../services/tasks/TaskService'
import { findProject, type AppEnv } from './appEnv'
import type { GithubServices } from './composeGithub'

const LINEAR_KEY_FILE = 'linear-key.bin'

export interface TaskDeps {
  readonly projects: ProjectStore
  readonly git: GitService
  readonly github: GithubServices
}

export interface TaskServices {
  readonly tasks: TaskService
  readonly linear: { readonly auth: LinearAuth; readonly issues: LinearIssues }
}

/** A project's tasks from GitHub Issues or Linear (decision 051), with the Linear connection. */
export function composeTasks(env: AppEnv, deps: TaskDeps): TaskServices {
  const { github } = deps
  const linear = linearConfig(env.overrides)
  const linearIssues = new LinearIssues({ fetch, apiUrl: linear.apiUrl })
  const linearAuth = new LinearAuth({
    store: new LinearKeyStore({
      filePath: join(env.dataDir, LINEAR_KEY_FILE),
      encryption: env.encryption,
    }),
    viewer: (apiKey) => linearIssues.viewer(apiKey),
  })
  const tasks = new TaskService({
    findProject: (id) => findProject(deps.projects, id),
    remoteUrl: (root) => deps.git.remoteUrl(root),
    github: {
      withToken: (call) => github.auth.withToken(call),
      issues: new GitHubIssues({ fetch, apiBaseUrl: github.config.apiBaseUrl }),
      webBaseUrl: github.config.webBaseUrl,
    },
    linear: {
      withKey: (call) => linearAuth.withKey(call),
      issues: linearIssues,
      webOrigin: linear.webOrigin,
    },
  })
  return { tasks, linear: { auth: linearAuth, issues: linearIssues } }
}
