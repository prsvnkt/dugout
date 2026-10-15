import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { addProjectFolder, clickMenuItem, launchApp, makeTempDir } from './helpers'

/** A 1×1 PNG. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

/** A one-page PDF saying "Hello PDF", with a correct cross-reference table. */
function makePdf(): Buffer {
  const content = 'BT /F1 24 Tf 72 720 Td (Hello PDF) Tj ET'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R ' +
      '/Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let body = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = body.length
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = body.length
  const entries = offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${entries.join('')}`
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(body, 'latin1')
}

/** Half a second of 8 kHz, 8-bit mono silence. */
function makeWav(): Buffer {
  const samples = 4000
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + samples, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(8000, 24)
  header.writeUInt32LE(8000, 28)
  header.writeUInt16LE(1, 32)
  header.writeUInt16LE(8, 34)
  header.write('data', 36)
  header.writeUInt32LE(samples, 40)
  return Buffer.concat([header, Buffer.alloc(samples, 128)])
}

/** An <img>'s decoded width: 0 until it has loaded. (The e2e project has no DOM types.) */
const naturalWidth = (image: Locator) =>
  image.evaluate((element) => (element as unknown as { naturalWidth: number }).naturalWidth)

let app: ElectronApplication
let page: Page

function makeRepo(): string {
  const root = join(makeTempDir(), 'media')
  mkdirSync(join(root, 'docs'), { recursive: true })
  execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: root })
  writeFileSync(join(root, 'logo.png'), Buffer.from(PNG_BASE64, 'base64'))
  writeFileSync(
    join(root, 'docs', 'guide.md'),
    '# Guide\n\nSee the logo:\n\n![logo](../logo.png)\n\n![outside](../../secret.png)\n',
  )
  writeFileSync(join(root, 'paper.pdf'), makePdf())
  writeFileSync(join(root, 'tone.wav'), makeWav())
  return root
}

test.beforeEach(async () => {
  app = await launchApp(makeTempDir())
  page = await app.firstWindow()
  await addProjectFolder(app, page, makeRepo())
})

test.afterEach(async () => {
  await app.close()
})

const explorer = () => page.getByRole('complementary', { name: 'Explorer' })
const editor = () => page.getByRole('region', { name: 'Editor' })

async function openFromExplorer(...segments: string[]): Promise<void> {
  for (const name of segments) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    await explorer()
      .getByRole('treeitem', { name: new RegExp(`^${escaped}( —|$)`) })
      .click()
  }
}

test('Markdown opens as a preview with local images, and toggles to its source', async () => {
  // Act
  await openFromExplorer('docs', 'guide.md')

  // Assert: rendered, with the checkout's image drawn and the outside one only named
  const preview = editor().getByRole('document', { name: 'Preview' })
  await expect(preview.getByRole('heading', { name: 'Guide' })).toBeVisible()
  const logo = preview.getByRole('img', { name: 'logo' })
  await expect.poll(() => naturalWidth(logo)).toBe(1)
  await expect(preview.getByRole('img', { name: 'outside' })).toHaveCount(0)

  // Source is the code editor, and edits there show in the preview
  await editor().getByRole('button', { name: 'Source' }).click()
  await expect(editor().locator('.monaco-editor .view-lines')).toContainText('# Guide')
  await editor().locator('.monaco-editor .view-lines').click()
  await page.keyboard.press('Meta+ArrowDown')
  await page.keyboard.type('\nAdded in source')
  await editor().getByRole('button', { name: 'Preview' }).click()
  await expect(preview).toContainText('Added in source')
  await expect(editor().getByRole('button', { name: /unsaved/ })).toBeVisible()
  await clickMenuItem(app, 'File', 'Save')
  await expect(editor().getByRole('button', { name: /unsaved/ })).toBeHidden()
})

test('an image opens fitted, with its dimensions, and toggles to actual size', async () => {
  await openFromExplorer('logo.png')

  const image = editor().getByRole('img', { name: 'logo.png' })
  await expect.poll(() => naturalWidth(image)).toBe(1)
  await expect(editor().getByTestId('viewer-details')).toContainText('1 × 1 px')
  await editor().getByRole('button', { name: 'Actual size' }).click()
  await expect(editor().getByRole('button', { name: 'Actual size' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('a PDF opens with its first page drawn', async () => {
  await openFromExplorer('paper.pdf')

  await expect(editor().getByTestId('viewer-details')).toContainText('1 page')
  await expect(editor().getByRole('img', { name: 'Page 1' })).toHaveAttribute(
    'data-rendered',
    'true',
  )
})

test('audio opens in a player that reads its length', async () => {
  await openFromExplorer('tone.wav')

  await expect(editor().getByTestId('viewer-details')).toContainText('0:01')
  const player = editor().locator('audio')
  await expect
    .poll(() => player.evaluate((audio) => (audio as unknown as { duration: number }).duration))
    .toBe(0.5)
})

test('the file protocol refuses other projects, escapes and files no viewer shows', async () => {
  const status = (url: string) => page.evaluate(async (target) => (await fetch(target)).status, url)

  expect(await status('dugout-file://checkout/logo.png?project=unknown')).toBe(403)
  expect(await status('dugout-file://checkout/..%2F..%2Fsecret.png?project=unknown')).toBe(400)
  expect(await status('dugout-file://checkout/docs/guide.md?project=unknown')).toBe(415)
})
