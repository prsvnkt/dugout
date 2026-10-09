import type { McpServer } from './agentConfig'

/**
 * A common MCP server that Agent settings adds in one click. The server's name is the preset's
 * id. Secrets are only ever `${VAR}` references, set in the user's shell.
 */
export interface McpPreset {
  readonly label: string
  readonly description: string
  /** What the user does after adding it (sign in, set a variable), shown under the preset. */
  readonly setup: string
  readonly server: McpServer
}

/** Checked against each vendor's docs or registry entry (2026-10-09); see decision 040. */
export const MCP_PRESETS: readonly McpPreset[] = [
  {
    label: 'Playwright',
    description: 'Drive a real browser: open pages, click, fill forms, take snapshots.',
    setup: 'Runs locally with npx; nothing to set.',
    server: {
      name: 'playwright',
      type: 'stdio',
      command: 'npx',
      args: ['@playwright/mcp@latest'],
      env: {},
    },
  },
  {
    label: 'Context7',
    description: 'Up-to-date library and framework docs for the agent to read.',
    setup: 'Set CONTEXT7_API_KEY in your shell (a key from context7.com).',
    server: {
      name: 'context7',
      type: 'http',
      url: 'https://mcp.context7.com/mcp',
      headers: { Authorization: 'Bearer ${CONTEXT7_API_KEY}' },
    },
  },
  {
    label: 'GitHub',
    description: "GitHub's official server: issues, pull requests, code and Actions.",
    setup: 'Set GITHUB_PAT in your shell (a GitHub personal access token).',
    server: {
      name: 'github',
      type: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      headers: { Authorization: 'Bearer ${GITHUB_PAT}' },
    },
  },
  {
    label: 'Sentry',
    description: 'Look up Sentry issues, events and stack traces.',
    setup: 'Signs in with Sentry the first time an agent uses it.',
    server: { name: 'sentry', type: 'http', url: 'https://mcp.sentry.dev/mcp', headers: {} },
  },
  {
    label: 'Linear',
    description: 'Find, create and update Linear issues and projects.',
    setup: 'Signs in with Linear the first time an agent uses it.',
    server: { name: 'linear', type: 'http', url: 'https://mcp.linear.app/mcp', headers: {} },
  },
  {
    label: 'Figma',
    description: 'Read Figma designs, components and variables to build from.',
    setup: 'Signs in with Figma the first time an agent uses it.',
    server: { name: 'figma', type: 'http', url: 'https://mcp.figma.com/mcp', headers: {} },
  },
  {
    label: 'Postgres',
    description: 'Query a Postgres database and inspect its schema, read-only.',
    setup: 'Needs uv installed; set DATABASE_URI in your shell (postgresql://…).',
    server: {
      name: 'postgres',
      type: 'stdio',
      command: 'uvx',
      args: ['postgres-mcp', '--access-mode=restricted'],
      env: { DATABASE_URI: '${DATABASE_URI}' },
    },
  },
]
