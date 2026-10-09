import { describe, expect, test } from 'vitest'
import { MAX_PREVIEW_TEXT, toolCallPreview, toolCallRef } from './toolCall'

describe('toolCallRef', () => {
  test('uses the tool id and keys the call by tool and main argument', () => {
    // Arrange
    const payload = {
      tool_name: 'Bash',
      tool_use_id: 'toolu_01',
      tool_input: { command: 'npm test', description: 'Run tests' },
    }

    // Act
    const ref = toolCallRef(payload)

    // Assert
    expect(ref).toEqual({ toolUseId: 'toolu_01', key: 'Bash\u0000npm test' })
  })

  test('a permission request without an id matches its later PostToolUse by key', () => {
    const request = { tool_name: 'Edit', tool_input: { file_path: '/r/a.ts', old_string: 'a' } }
    const finished = {
      tool_name: 'Edit',
      tool_use_id: 'toolu_02',
      tool_input: { file_path: '/r/a.ts', old_string: 'a', replace_all: false },
    }

    expect(toolCallRef(request)?.toolUseId).toBeNull()
    expect(toolCallRef(request)?.key).toBe(toolCallRef(finished)?.key)
  })

  test('keys other tools by their whole input, whatever the key order', () => {
    const a = toolCallRef({ tool_name: 'mcp__x', tool_input: { b: 1, a: [2, { d: 3, c: 4 }] } })
    const b = toolCallRef({ tool_name: 'mcp__x', tool_input: { a: [2, { c: 4, d: 3 }], b: 1 } })
    expect(a?.key).toBe(b?.key)
  })

  test('ignores payloads without a tool, and tool ids that are not plain tokens', () => {
    expect(toolCallRef({ tool_input: { command: 'ls' } })).toBeNull()
    expect(toolCallRef({ tool_name: 'Bash', tool_use_id: '$(whoami)' })?.toolUseId).toBeNull()
  })
})

describe('toolCallPreview', () => {
  test('shows a command in full with its description', () => {
    const command = `npm run build && ${'x'.repeat(300)}`
    expect(
      toolCallPreview({ tool_name: 'Bash', tool_input: { command, description: 'Build it' } }),
    ).toEqual({ kind: 'command', tool: 'Bash', command, description: 'Build it' })
  })

  test('joins a command given as an argument list (Codex)', () => {
    expect(
      toolCallPreview({ tool_name: 'Bash', tool_input: { command: ['git', 'push', 'origin'] } }),
    ).toMatchObject({ kind: 'command', command: 'git push origin', description: null })
  })

  test('shows an edit as the file and its replacements', () => {
    expect(
      toolCallPreview({
        tool_name: 'Edit',
        tool_input: { file_path: '/r/a.ts', old_string: 'let a = 1', new_string: 'const a = 1' },
      }),
    ).toEqual({
      kind: 'edit',
      tool: 'Edit',
      filePath: '/r/a.ts',
      changes: [{ before: 'let a = 1', after: 'const a = 1' }],
    })
  })

  test('shows every replacement of a MultiEdit, and a Write as all new text', () => {
    const multi = toolCallPreview({
      tool_name: 'MultiEdit',
      tool_input: {
        file_path: '/r/a.ts',
        edits: [
          { old_string: 'a', new_string: 'b' },
          { old_string: 'c', new_string: 'd' },
        ],
      },
    })
    const write = toolCallPreview({
      tool_name: 'Write',
      tool_input: { file_path: '/r/new.ts', content: 'hello\n' },
    })

    expect(multi).toMatchObject({
      changes: [
        { before: 'a', after: 'b' },
        { before: 'c', after: 'd' },
      ],
    })
    expect(write).toMatchObject({ kind: 'edit', changes: [{ before: '', after: 'hello\n' }] })
  })

  test('lists the arguments of any other tool', () => {
    expect(
      toolCallPreview({
        tool_name: 'WebFetch',
        tool_input: { url: 'https://example.com', prompt: 'Summarise', retries: 2 },
      }),
    ).toEqual({
      kind: 'other',
      tool: 'WebFetch',
      fields: [
        { name: 'url', value: 'https://example.com' },
        { name: 'prompt', value: 'Summarise' },
        { name: 'retries', value: '2' },
      ],
    })
  })

  test('clips very long texts and says so', () => {
    const preview = toolCallPreview({
      tool_name: 'Write',
      tool_input: { file_path: '/r/big.txt', content: 'x'.repeat(MAX_PREVIEW_TEXT + 500) },
    })
    const after = preview?.kind === 'edit' ? preview.changes[0]?.after : ''
    expect(after?.length).toBeLessThan(MAX_PREVIEW_TEXT + 100)
    expect(after).toMatch(/500 more characters/)
  })

  test('is null without a tool name', () => {
    expect(toolCallPreview({ tool_input: { command: 'ls' } })).toBeNull()
  })
})
