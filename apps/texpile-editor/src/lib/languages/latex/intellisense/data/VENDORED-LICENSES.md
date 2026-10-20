# Vendored completion data

The data files in this directory (`macroForms.ts` and the "@" mnemonics now in
`editor/snippets/file/builtinSnippets.ts`), and the package and class captions in
`languages/latex/knowledge/data/texpile/catalog.json`, are vendored or generated from the [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop)
VS Code extension (v10.16.1), distributed under the MIT license:

```
The MIT License (MIT)

Copyright (c) 2016 James Yu

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

# Package data

Texpile's package scan (`package-scan/` in texpile-tools) generates the files under `packages/` from the packages and
classes in TeX Live 2026 and CTAN. A `doc` quotes a sentence from the package's own manual. Each manual is distributed
under its package's license, most often the LaTeX Project Public License. A math symbol's glyph and name come from
`unicode-math-table.tex` of the unicode-math package (LaTeX Project Public License).

# Snippet transforms and variables

The transform reader and case conversions in `editor/snippets/expand/body/bodyTransform.ts`, and the
variable values in `editor/snippets/expand/body/bodyVariables.ts`, are ported from
[Visual Studio Code](https://github.com/microsoft/vscode) (`src/vs/editor/contrib/snippet/browser/snippetParser.ts`
and `snippetVariables.ts`), distributed under the MIT license:

```
MIT License

Copyright (c) 2015 - present Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
