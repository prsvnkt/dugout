import { execFileSync } from 'node:child_process'
import { mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, test } from 'vitest'
import { fileUrl } from '@shared/viewers'
import type { GitCheckout } from '@shared/worktree'
import { GitService } from '../git/GitService'
import { FileService } from '../files/FileService'
import { createFileProtocolHandler } from './fileProtocol'

const files = new FileService({ git: new GitService({ env: process.env }) })

let root: string
let warnings: string[]
let handle: (request: Request) => Promise<Response>

function makeRepo(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-protocol-')))
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir })
  return dir
}

beforeEach(() => {
  root = makeRepo()
  warnings = []
  handle = createFileProtocolHandler({
    resolveRoot: async (checkout: GitCheckout) => {
      if (checkout.projectId !== 'p1') throw new Error('Project not found.')
      return root
    },
    files,
    warn: (message) => warnings.push(message),
  })
})

const get = (url: string, headers: Record<string, string> = {}, method = 'GET') =>
  handle(new Request(url, { method, headers }))

describe('the dugout-file protocol', () => {
  test('serves a media file with its content type and length', async () => {
    // Arrange
    writeFileSync(join(root, 'logo.png'), 'PNGDATA')

    // Act
    const response = await get(fileUrl({ projectId: 'p1' }, 'logo.png', 1))

    // Assert
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('content-length')).toBe('7')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(await response.text()).toBe('PNGDATA')
  })

  test('serves a byte range so a video can seek', async () => {
    writeFileSync(join(root, 'clip.mp4'), '0123456789')

    const response = await get(fileUrl({ projectId: 'p1' }, 'clip.mp4'), { Range: 'bytes=3-5' })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 3-5/10')
    expect(response.headers.get('content-length')).toBe('3')
    expect(await response.text()).toBe('345')
  })

  test('answers an unsatisfiable range with 416 and the size', async () => {
    writeFileSync(join(root, 'clip.mp4'), '0123456789')

    const response = await get(fileUrl({ projectId: 'p1' }, 'clip.mp4'), { Range: 'bytes=10-' })

    expect(response.status).toBe(416)
    expect(response.headers.get('content-range')).toBe('bytes */10')
  })

  test('answers HEAD without a body, and a CORS preflight for Range', async () => {
    writeFileSync(join(root, 'doc.pdf'), '%PDF-1.4')
    const url = fileUrl({ projectId: 'p1' }, 'doc.pdf')

    const head = await get(url, {}, 'HEAD')
    const preflight = await get(url, {}, 'OPTIONS')

    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('8')
    expect(head.body).toBeNull()
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Range')
  })

  test.each([
    ['another method', fileUrl({ projectId: 'p1' }, 'a.png'), 'POST', 405],
    ['an invalid URL', 'dugout-file://checkout/a.png', 'GET', 400],
    ['a path escaping the checkout', 'dugout-file://checkout/..%2Fa.png?project=p1', 'GET', 400],
    ['a file no viewer shows', fileUrl({ projectId: 'p1' }, '.env'), 'GET', 415],
    ['source code', fileUrl({ projectId: 'p1' }, 'src/app.ts'), 'GET', 415],
    ['a missing file', fileUrl({ projectId: 'p1' }, 'gone.png'), 'GET', 404],
  ])('refuses %s', async (_name, url, method, status) => {
    const response = await get(url, {}, method)

    expect(response.status).toBe(status)
  })

  test('refuses an unknown project and a symlink out of the checkout, and says why', async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'dugout-protocol-outside-')))
    writeFileSync(join(outside, 'secret.png'), 'secret')
    symlinkSync(join(outside, 'secret.png'), join(root, 'link.png'))

    const unknown = await get(fileUrl({ projectId: 'other' }, 'logo.png'))
    const escaped = await get(fileUrl({ projectId: 'p1' }, 'link.png'))

    expect(unknown.status).toBe(403)
    expect(escaped.status).toBe(403)
    expect(await escaped.text()).toBe('')
    expect(warnings).toEqual([
      '[dugout-file] refused logo.png: Project not found.',
      '[dugout-file] refused link.png: link.png is outside the project.',
    ])
  })
})
