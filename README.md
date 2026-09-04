<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="branding/Logo-light.svg" />
  <img alt="Texpile" src="branding/Logo-dark.svg" width="320" />
</picture>

&nbsp;

A modern, desktop editor for LaTeX, Typst, and Markdown. For Windows, macOS, and Linux. Edit visually, or in source with advanced intellisense. 100% offline, no account.

[![Version](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fdl.texpile.com%2Flatest.json&query=%24.version&label=version&prefix=v&color=blue)](https://texpile.com/download)
[![Platforms](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-green)](https://texpile.com/download)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.com/invite/7wanVzCBWf)

</div>

---

![Texpile editing a LaTeX project, with the PDF preview and comments open](docs/images/overview.webp)

## Visual editor

Texpile's visual editor supports LaTeX, Typst, and Markdown. Texpile stores them as plain `.tex`, `.typ`, and `.md` files, respectively. Texpile's visual editor covers complicated elements such as citations, cell-merging tables, multirow equations, and more.

![The Texpile visual editor](docs/images/visual-editing.webp)

## Live preview for LaTeX

Type in source view and the page re-typesets with your own LuaLaTeX. Many updates, such as text changes, are rendered instantly.
https://github.com/user-attachments/assets/4ecb01f8-ae3b-4b24-be75-a0bce801768f


## Shared sessions (real time collaboration)

Share a folder for real time editing, no account needed. Start a session (File > Shared Session) to get a code; others join with it from the home screen and edit alongside you, in the visual editor or in source. Everything is end to end encrypted, so the relay server only forwards data it cannot read.

## Comments

Texpile supports adding comments, and you can add them in both the visual and the source editor.

## Installation

Download the installer for your platform from [texpile.com/download](https://texpile.com/download), then install a compiler for the format you write in:

- [LaTeX](https://texpile.com/docs/installation/latex) — a TeX distribution: TeX Live, MacTeX, or MiKTeX
- [Typst](https://texpile.com/docs/installation/typst) — one program, tinymist

Editing works out of the box; the compiler is only needed to produce a PDF. Markdown needs neither.

## Privacy

Your documents stay on your disk. The app's only background network traffic is the update check, which you can turn off in Preferences. Shared sessions are end to end encrypted, so Texpile can never see your data.

## Community

Questions, bugs, or feedback? Join the [Discord](https://discord.com/invite/7wanVzCBWf).

## Acknowledgements

Beyond its package dependencies, Texpile vendors or derives from the following projects:

- [LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop) (MIT). Texpile's intellisense for LaTeX is largely derived from LaTeX Workshop.
- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0). The live preview's Type1 font parsing is adapted from it.

## License

[AGPL-3.0](LICENSE)

The Texpile name and logo are trademarks of the Texpile project and are not covered by the code
license; see [TRADEMARK.md](TRADEMARK.md).
