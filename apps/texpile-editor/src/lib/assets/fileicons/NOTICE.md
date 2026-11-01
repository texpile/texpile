# File-type icons

Vendored from **Material Icon Theme** (`material-icon-theme` on npm, v5.37.0) —
<https://github.com/material-extensions/vscode-material-icon-theme>

Only the icons this app actually shows are copied here, and the sole modification to each is
adding `width`/`height` of `100%` so it fills its slot. **The upstream colours are kept.** They
were briefly retinted to `currentColor` to match the tree's monochrome tone, which failed for a
reason worth recording: apparent lightness follows a glyph's ink coverage, not its colour, so a
single tone made dense marks (markdown) read far heavier than sparse ones (the TeX logotype), and
antialiasing thinned hairlines further at 16px. Hue does the differentiating instead, and the
density mismatch stops mattering.

Their square viewBoxes are load-bearing: they are what makes every icon centre identically in
the tree's icon slot. Don't crop them to their glyph bounds.

`folder.svg` / `folder-open.svg` cover directory rows. The pack also ships ~200 name-matched
folder variants (`folder-images`, `folder-dist`, ...) which are deliberately **not** vendored:
they colour-code a tree by source-repo conventions that don't mean anything in a writing
workspace.

`tikz.svg` is drawn for this app, because the pack has no TikZ icon. Texpile's own license covers it.

To refresh, re-run `npm pack material-icon-theme`, then copy + retint the files listed in
`fileIconMap.ts`.

## License

The MIT License (MIT)

Copyright (c) 2025 Material Extensions

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or
substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
