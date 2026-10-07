// Renders the app icon SVGs in resources/ into icon.png and the macOS icon.icns, using Electron
// itself as the renderer. The SVGs are the source of truth; run `npm run icons` after changing them.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { app, BrowserWindow } from 'electron'

const RESOURCES_DIR = 'resources'
const FULL_ICON = join(RESOURCES_DIR, 'icon.svg')
const SMALL_ICON = join(RESOURCES_DIR, 'icon-small.svg')
const PNG_SIZE = 1024
// At 32 px and below the full mark turns to mush; use the simplified one.
const SMALL_ICON_MAX_PX = 32
// iconutil wants icon_<size>x<size>.png and its @2x twin for each of these.
const ICONSET_SIZES = [16, 32, 128, 256, 512]
const SCALES = [1, 2]

function createRenderWindow() {
  return new BrowserWindow({
    width: PNG_SIZE,
    height: PNG_SIZE,
    show: false,
    frame: false,
    transparent: true,
    webPreferences: { offscreen: true },
  })
}

async function renderPng(window, svgPath, px, outPath) {
  const svg = readFileSync(svgPath, 'utf8')
  const html = `<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:${px}px;height:${px}px}</style>${svg}`
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  const image = await window.webContents.capturePage({ x: 0, y: 0, width: px, height: px })
  writeFileSync(outPath, image.resize({ width: px, height: px, quality: 'best' }).toPNG())
}

async function renderIconset(window, iconsetDir) {
  for (const size of ICONSET_SIZES) {
    for (const scale of SCALES) {
      const px = size * scale
      const source = px <= SMALL_ICON_MAX_PX ? SMALL_ICON : FULL_ICON
      const suffix = scale === 1 ? '' : `@${scale}x`
      await renderPng(window, source, px, join(iconsetDir, `icon_${size}x${size}${suffix}.png`))
    }
  }
}

async function main() {
  if (process.platform !== 'darwin') throw new Error('icon.icns needs macOS iconutil')
  const workDir = mkdtempSync(join(tmpdir(), 'dugout-icon-'))
  const iconsetDir = join(workDir, 'icon.iconset')
  mkdirSync(iconsetDir)
  await app.whenReady()
  const window = createRenderWindow()
  try {
    await renderPng(window, FULL_ICON, PNG_SIZE, join(RESOURCES_DIR, 'icon.png'))
    await renderIconset(window, iconsetDir)
    execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', join(RESOURCES_DIR, 'icon.icns')])
  } finally {
    window.destroy()
    rmSync(workDir, { recursive: true, force: true })
  }
}

app.dock?.hide()
main()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error('[icons] failed:', error)
    app.exit(1)
  })
