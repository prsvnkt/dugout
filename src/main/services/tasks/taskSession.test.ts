import { describe, expect, test } from 'vitest'
import { taskBranchName, taskNumberFromBranch, taskPrompt } from './taskSession'

describe('task sessions', () => {
  test('names the worktree after the task', () => {
    expect(taskBranchName(42, 'Fix the login timeout!')).toBe('42-fix-the-login-timeout')
    expect(taskBranchName(7, '   ')).toBe('7-task')
    expect(taskBranchName(9, 'a'.repeat(100))).toHaveLength(42)
  })

  test('finds the task number in a dugout branch', () => {
    expect(taskNumberFromBranch('dugout/42-fix-login')).toBe(42)
    expect(taskNumberFromBranch('dugout/a1b2c3')).toBeNull()
    expect(taskNumberFromBranch('feature/42-x')).toBeNull()
    expect(taskNumberFromBranch(null)).toBeNull()
  })

  test('the first prompt carries the issue and how to report back', () => {
    const prompt = taskPrompt({
      number: 42,
      key: '#42',
      title: 'Fix login',
      body: 'Times out after 5s',
      url: 'https://x/42',
    })
    expect(prompt).toContain('#42: Fix login')
    expect(prompt).toContain('Times out after 5s')
    expect(prompt).toContain('dugout task tools')
  })

  test('a Linear task is named by its identifier, with the number the tools take', () => {
    const prompt = taskPrompt({
      number: 7,
      key: 'ENG-7',
      title: 'Dark mode',
      body: '',
      url: 'https://linear.app/acme/issue/ENG-7',
    })
    expect(prompt).toContain('task ENG-7: Dark mode')
    expect(prompt).toContain('number 7')
    expect(prompt).not.toContain('GitHub')
  })

  test('very long issue bodies are trimmed', () => {
    const prompt = taskPrompt({
      number: 1,
      key: '#1',
      title: 't',
      body: 'x'.repeat(50_000),
      url: 'u',
    })
    expect(prompt.length).toBeLessThan(9_000)
  })
})
