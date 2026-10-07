# Security policy

Dugout runs shells, reads and writes files in your repositories, and stores a GitHub token, so
security reports are very welcome.

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub instead:
[Security → Report a vulnerability](https://github.com/prsvnkt/dugout/security/advisories/new).

Include what an attacker could do, the steps to reproduce, and the Dugout version or commit.

Dugout is maintained by one person, so responses are best effort: expect an acknowledgement
within a week. Once a fix is released, the advisory is published with credit to you, unless you
prefer otherwise.

## Supported versions

Only the latest release (and `main`) receives security fixes.

## Scope

Especially relevant:

- The GitHub token leaving the main process, or being written anywhere unencrypted.
- The renderer reaching the OS other than through the validated IPC API.
- File access escaping a project's checkout (including through symlinks).
- Anything that lets one terminal's agent act on another project through the MCP server or the
  hook socket.

Vulnerabilities in Claude Code itself should go to Anthropic, not here.
