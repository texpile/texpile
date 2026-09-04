---
nav: Typst
description: Typst in Texpile: the same visual and source editors, compiling and a live preview through tinymist, and what the editor does differently for .typ files.
blurb: The same editors, with compiling and the preview through tinymist.
icon: type
order: 12
section: Formats
---

# Typst

A .typ file opens in the same visual and source editors as a LaTeX file, and compiles and previews through tinymist.

| Where to find it | Path               | Note                                              |
| ---------------- | ------------------ | ------------------------------------------------- |
| In the editor    | Open any .typ file | Set it as the main file to compile or preview it. |

![A Typst document in the visual editor: headings with their labels, formatted text, and lists](../../landing/src/lib/assets/showcase/app/typst-visual.png 'A Typst document in the visual editor: headings with their labels, formatted text, and lists')

## What differs

- A label such as `<sec:intro>` shows under its heading, and @ inserts a reference to a label or a citation key.
- Anything the visual editor cannot show stays in place as a Typst code chip.
- Completion, hover help, and errors as you type come from tinymist, for guests in a shared session too.

The [Equations](../visual-editing/math.md), [Images](../visual-editing/images.md), [Tables](../visual-editing/tables.md), and [Citations](../visual-editing/citations.md) pages each end with what differs in Typst.

[Live preview](live-preview.md)
[Installing tinymist](../installation/typst/README.md)
