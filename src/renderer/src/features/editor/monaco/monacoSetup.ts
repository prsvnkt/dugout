import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import CssWorker from 'monaco-editor/languages/features/css/css.worker?worker'
import HtmlWorker from 'monaco-editor/languages/features/html/html.worker?worker'
import JsonWorker from 'monaco-editor/languages/features/json/json.worker?worker'
import TsWorker from 'monaco-editor/languages/features/typescript/ts.worker?worker'

const WORKERS: Record<string, new () => Worker> = {
  json: JsonWorker,
  css: CssWorker,
  scss: CssWorker,
  less: CssWorker,
  html: HtmlWorker,
  handlebars: HtmlWorker,
  razor: HtmlWorker,
  typescript: TsWorker,
  javascript: TsWorker,
}

self.MonacoEnvironment = {
  getWorker: (_workerId, label) => new (WORKERS[label] ?? EditorWorker)(),
}

// Files are shown without their project context (no tsconfig, no node_modules types), so
// semantic errors would be noise. Syntax errors are still reported.
for (const defaults of [
  monaco.typescript.typescriptDefaults,
  monaco.typescript.javascriptDefaults,
]) {
  defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false })
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export const THEME = 'dugout-dark'

monaco.editor.defineTheme(THEME, {
  base: 'vs-dark',
  inherit: true,
  rules: [],
  colors: {
    'editor.background': token('--bg-app'),
    'editor.foreground': token('--text-primary'),
    'editorLineNumber.foreground': token('--text-muted'),
    'editorGutter.background': token('--bg-app'),
    'editorWidget.background': token('--bg-panel'),
    'editor.lineHighlightBackground': token('--bg-panel'),
  },
})

export const EDITOR_FONT = {
  fontFamily: "'JetBrains Mono', ui-monospace, monospace",
  fontSize: 13,
  lineHeight: 20,
}

export { monaco }
