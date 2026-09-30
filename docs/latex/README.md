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
| Setting          | Terminal › Configure Compile Command… | The command, the engine, and the Live mode switch.         |

## Its own pages

These pages are about LaTeX:

- [Live preview](live-preview.md)
- [Compiling](compiling.md)
- [Intellisense](intellisense.md)

The [Visual editing](../visual-editing/README.md) pages apply to every format. Equations, images, tables, and citations each say what differs in Typst and Markdown.

## Symbols

Every symbol Detexify knows, over a thousand, drawn as LaTeX draws it and found by command, by what it means, or by package.

| Where to find it | Path                                               | Note                                 |
| ---------------- | -------------------------------------------------- | ------------------------------------ |
| Menu             | Insert › Symbol…                                   | In the visual and the source editor. |
| In the editor    | The Ω button on the source bar, then More Symbols… | Below the common math symbols.       |
| Shortcut         | Ctrl+K                                             | Then "Insert Symbol".                |

- Type a command, with or without its backslash (`subsetneq`, `\alpha`), what it means (not equal, empty set), or a package (`stmaryrd`). Or browse the tabs. The symbols you used last come first.
- The arrow keys move through the grid, Enter inserts, and Esc closes.
- Below the grid is where the symbol works (in text, in math, or in either) and the `\usepackage` line it needs, if any.
- In text a math symbol goes in `$...$`, and next to an inline equation it joins that equation. In math a text symbol goes in `\text{...}`, or in `\mbox{...}` where amsmath is not loaded. A command in text ends in `{}`, so the space typed after it is kept.
- In the visual editor a math symbol becomes an equation of its own and a text symbol a LaTeX chip. A selected equation is kept and the symbol goes after it.
- When the symbol needs a package that the file's preamble does not load, a notice offers to add the `\usepackage` line. Texpile never adds one on its own, since some packages clash with others. A file without a preamble of its own, such as a chapter, gets no notice.

## What it needs

A TeX distribution: TeX Live, MacTeX, or MiKTeX. Editing works without one. Compiling and the live preview do not.

[Installing a TeX distribution](../installation/latex/README.md)
