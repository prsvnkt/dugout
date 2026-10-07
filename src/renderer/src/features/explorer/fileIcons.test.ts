import { describe, expect, test } from 'vitest'
import { iconFor } from './fileIcons'

describe('iconFor', () => {
  test('prefers an exact file name over the extension', () => {
    expect(iconFor('README.md').id).toBe('info')
    expect(iconFor('notes.md').id).toBe('markdown')
    expect(iconFor('tsconfig.json').id).toBe('tsconfig')
  })

  test('matches the longest extension first', () => {
    expect(iconFor('app.ts').id).toBe('typescript')
    expect(iconFor('App.tsx').id).toBe('react')
    expect(iconFor('package.json').id).toBe('json')
  })

  test('matches dotfiles by their whole name', () => {
    expect(iconFor('.gitignore').id).toBe('git')
    expect(iconFor('.editorconfig').id).toBe('config')
  })

  test('matches partial names such as Dockerfile', () => {
    expect(iconFor('Dockerfile').id).toBe('docker')
  })

  test('falls back to the default icon', () => {
    expect(iconFor('no-extension').id).toBe('default')
    expect(iconFor('weird.zzzz').id).toBe('default')
  })

  test('returns an SVG and a Dugout colour token, never a raw Seti colour name', () => {
    const icon = iconFor('app.ts')

    expect(icon.svg).toMatch(/^<svg /)
    expect(icon.color).toMatch(/^var\(--/)
  })
})
