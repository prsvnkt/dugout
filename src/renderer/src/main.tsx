import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/schibsted-grotesk/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/global.css'
import { App } from './app/App'

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('Root element #root not found')

// xterm measures its cell size once, when a terminal opens; load the bundled mono font first
// so it doesn't measure a fallback font.
const TERMINAL_FONT = '400 13px "JetBrains Mono Variable"'

function render(root: HTMLElement): void {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

document.fonts.load(TERMINAL_FONT).then(
  () => render(rootElement),
  (error: unknown) => {
    console.error('[fonts] terminal font failed to load', error)
    render(rootElement)
  },
)
