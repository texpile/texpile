---
nav: Live preview
description: Typst live preview in Texpile: a pane that renders the document as you type through tinymist, on by default, with jumps between the source and the preview in both directions.
blurb: A pane that renders the document as you type, through tinymist.
icon: eye
order: 1
---

# Live preview

A Typst document renders as you type in a pane beside the editor, through tinymist, in the visual editor and in source mode alike. It is on by default for a .typ main file, and it needs no save and no rebuild.

| Where to find it | Path                                            | Note                                       |
| ---------------- | ----------------------------------------------- | ------------------------------------------ |
| Toolbar          | The Preview button                              | It reads Live while the pane is open.      |
| Setting          | Terminal › Configure Compile Command… › Preview | Off, the button compiles to a PDF instead. |

![The Typst preview beside the source editor, rendering the document as it is typed](../../landing/src/lib/assets/showcase/typst-preview.webp 'The Typst preview beside the source editor, rendering the document as it is typed')

The arrow button at the top of the divider shows the current line in the preview, the pane's Follow switch keeps it on the caret, and a click in the preview jumps back to the source. Guests in a shared session see the host's preview.

The eye button in the preview toolbar shows the document as a reader with a color vision deficiency sees it, without changing any file. It is the same check as the PDF pane's [color vision check](../latex/compiling.md). The toolbar also has Save as PDF, and Export for PNG, SVG, HTML, and PDF standards: [Export](export.md).

> [!NOTE]
> The preview needs tinymist installed. Editing works without it.
