# Seti UI file icons

`icons.json` (SVG per icon) and `definitions.json` (file name / extension → icon and colour)
are copied unchanged from the npm package `seti-icons@0.0.4` (MIT, per its package.json),
which packages the icons of Seti UI — the default file icon theme in VS Code.

Vendored instead of installed: the package depends on svgo 1.x (378 packages and high-severity
audit findings) that is never used at runtime. Colours are remapped to Dugout tokens in
`../fileIcons.ts`.

- Seti UI: https://github.com/jesseweed/seti-ui
- seti-icons: https://github.com/elviswolcott/seti-icons

## Seti UI licence

Copyright (c) 2014 Jesse Weed

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the
"Software"), to deal in the Software without restriction, including
without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to
permit persons to whom the Software is furnished to do so, subject to
the following conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
