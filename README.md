<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/texpile-editor/src/lib/assets/logo/Logo-light.svg" />
  <img alt="Texpile" src="apps/texpile-editor/src/lib/assets/logo/Logo-dark.svg" width="320" />
</picture>

&nbsp;

Texpile is a modern, local, offline LaTeX editor for Windows, macOS, and Linux. Its visual editor shows your document as formatted text, math, tables, and figures while you write, and a live preview compiled by your own TeX distribution updates as you type. Drop into source view whenever you want. No account, no cloud, your documents never leave your machine.

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdl.texpile.com%2Flatest.json&query=%24.version&label=version&prefix=v&color=blue)](https://texpile.com/download)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-green)](https://texpile.com/download)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE.md)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.com/invite/7wanVzCBWf)

</div>

---

## Visual editor

Edit your document as formatted text, math, tables, and figures. The same file opens in source view whenever you want it.

![The Texpile visual editor](landing/src/lib/assets/showcase/visual-dark.png)

## Live preview

Type in source view and the page re-typesets with your own LuaLaTeX and updates in place, patched in milliseconds. Math, TikZ, and pgfplots figures render live.

https://github.com/user-attachments/assets/7a2d7997-fe6c-4837-bbe5-1aaa5e0c90b7

## Download

Installers for all three platforms are on [texpile.com/download](https://texpile.com/download), or directly:

| Platform         | Link                                                                   |
| ---------------- | ---------------------------------------------------------------------- |
| Windows          | [dl.texpile.com/latest/windows](https://dl.texpile.com/latest/windows) |
| macOS            | [dl.texpile.com/latest/mac](https://dl.texpile.com/latest/mac)         |
| Linux (AppImage) | [dl.texpile.com/latest/linux](https://dl.texpile.com/latest/linux)     |
| Linux (.deb)     | [dl.texpile.com/latest/deb](https://dl.texpile.com/latest/deb)         |

Editing works out of the box. To compile PDFs, install a TeX distribution (TeX Live, MiKTeX, or MacTeX) and Texpile runs it for you.

## More features

- **Your `.tex` file stays yours.** There is no internal document format. Saving a file you did not change writes back the exact same bytes. Editing one paragraph regenerates only that block; the rest of the file, including your preamble and any LaTeX the editor does not model, is preserved verbatim.
- **Compile with your own toolchain.** The Compile button runs your command (`latexmk`, `pdflatex`, a Makefile, anything) in a built-in terminal. Multi-file projects are supported, with automatic main file detection.
- **Compile errors as a Problems list.** The LaTeX log (and BibTeX/biber logs) are parsed into errors and warnings with file and line, shown in a panel and inline in the source editor.
- **PDF preview with SyncTeX.** Jump from text to PDF and from PDF back to the exact source line.
- **References.** A `.bib` editor and `@`-citation autocomplete.
- **Source control.** Side-by-side diff against the last commit, staging, and commits, built on your existing git repository.
- **Spell check** runs locally via [Harper](https://github.com/Automattic/harper).
- **Starters** for blank articles, APA, and MLA documents.

## Privacy

Your documents stay on your disk. The app's only network traffic is the update check, which you can turn off in Preferences.

## Community

Questions, bugs, or feedback? Join the [Discord](https://discord.com/invite/7wanVzCBWf).

## License

[AGPL-3.0](LICENSE.md)
