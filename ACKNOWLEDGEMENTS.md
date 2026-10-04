# Acknowledgements

Beyond its package dependencies, Texpile vendors or derives from the following projects:

- [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop) (MIT). Texpile's intellisense for LaTeX is largely derived from LaTeX Workshop.
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0). The live preview's Type1 font parsing is adapted from it.
- [Typst](https://github.com/typst/typst) (Apache-2.0). The Typst symbol picker's table is generated from Typst's own symbol names.
- [tinymist](https://github.com/Myriad-Dreamin/tinymist) (Apache-2.0). The Typst symbol picker's categories come from tinymist's symbol list.
- [Visual Studio Code](https://github.com/microsoft/vscode) (MIT). The terminal's setup and its resize handling are ported from VS Code's; the license is in `apps/texpile-editor/src/lib/terminal/VSCODE-LICENSE.txt`.
- The [Unicode Character Database](https://www.unicode.org/ucd/) (Unicode License V3). The Typst symbol picker searches Unicode's character names; the license is in `apps/texpile-editor/src/lib/languages/typst/symbols/UNICODE-LICENSE.txt`.
- [Detexify](https://github.com/kirel/detexify) (MIT). The LaTeX symbol picker's table and its pictures of each symbol are generated from Detexify's; the license is in `apps/texpile-editor/src/lib/languages/latex/symbols/DETEXIFY-LICENSE.txt`.
