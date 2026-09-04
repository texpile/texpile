---
nav: LaTeX
description: LaTeX in Texpile: the format the rest of the docs describe, with links to the pages about live preview, compiling, intellisense, and the visual editor's LaTeX details.
blurb: The format the rest of these docs describe, and where its own pages are.
icon: sigma
order: 11
section: Formats
---

# LaTeX

LaTeX is the format the rest of these docs describe. Where a page says nothing about formats, it is about a .tex file. Compiling and the live preview run on the TeX distribution installed on your computer.

| Where to find it | Path                                  | Note                                                       |
| ---------------- | ------------------------------------- | ---------------------------------------------------------- |
| In the editor    | Open any .tex file                    | The main file is picked automatically, or set it yourself. |
| Toolbar          | The Compile or Preview button         | Top right of the editor. Preview once live mode is on.     |
| Setting          | Terminal › Configure compile command… | The command, the engine, and the Live mode switch.         |

## Its own pages

These pages are about LaTeX:

- [Live preview](live-preview.md)
- [Compiling](compiling.md)
- [Intellisense](intellisense.md)

The [Visual editing](../visual-editing/README.md) pages apply to every format. Equations, images, tables, and citations each say what differs in Typst and Markdown.

## What it needs

A TeX distribution: TeX Live, MacTeX, or MiKTeX. Editing works without one. Compiling and the live preview do not.

[Installing a TeX distribution](../installation/latex/README.md)
