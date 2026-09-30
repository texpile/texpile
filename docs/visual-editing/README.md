---
nav: Visual editing
description: Texpile's visual editor shows a .tex, .typ, or .md file as formatted text, math, figures, and tables, and saves it back unchanged.
blurb: Your document shown as formatted text, math, figures, and tables, and saved back unchanged.
icon: pen-line
order: 3
section: Editor
---

# Visual editing

The visual editor shows your document as formatted text, math, figures, and tables, and saves it back as the same .tex, .typ, or .md.

> [!NOTE]
> Fonts, spacing, and layout come from your engine and template. For those, see [Live preview](../latex/live-preview.md).

| Where to find it | Path                       | Note                                |
| ---------------- | -------------------------- | ----------------------------------- |
| In the editor    | The Visual / Source toggle | Top right corner of the editor.     |
| Shortcut         | Ctrl+K                     | Then "Switch to the Visual Editor". |

![The Visual / Source toggle, Visual selected, in the top right corner of the editor](../../landing/src/lib/assets/showcase/app/visual-source-toggle-visual.png)

![Typing in the visual editor, with math and formatting applied live](../../landing/src/lib/assets/showcase/visual-typing.mp4 'Typing in the visual editor, with math and formatting applied live')

## What it covers

Articles, papers, essays, and reports. Anything the editor cannot show stays in place as a code chip that you can still edit.

## Cross-references

Type @ to reference any equation, figure, table, or citation. Equations keep their numbers, so a reference reads as the number it will print as.

## Pasting

Text pasted from a web page, Word, Google Docs, or a spreadsheet keeps its headings, lists, tables, links, bold, italic, underline, and code. Its fonts, sizes, text colors, and cell fills are left behind. Text copied inside Texpile keeps everything, colors included.

- Markdown, such as an answer copied from an AI chat, pastes as the formatting it spells out: headings, lists, tables, links, and math.
- LaTeX or Typst source pastes as the document it describes, the same as a copy from the source editor, and so does a copy from a code editor such as VS Code. Other code copied from a code editor pastes as a code block.
- A picture held in the clipboard is saved into the project's images folder. A picture that only links to the web or to a file is left out, and a notice says so; copy that picture on its own and paste it. In a Markdown file a web picture stays as a link.
- When Markdown, LaTeX or Typst was read wrong, Ctrl+Z leaves the text as it was copied. A second Ctrl+Z removes the paste.
- Ctrl+Shift+V, or Paste Without Formatting in the right-click menu, pastes the plain text.

To paste everything from other apps as plain text, turn off Preferences › Editor › Smart paste.

## Shortcuts

The usual keys apply: Ctrl+B for bold, Ctrl+I for italic, Ctrl+M for an inline equation.

[All keyboard shortcuts](../shortcuts.md)

## More

Each page ends with what differs in Typst and Markdown.

- [Equations](math.md)
- [Images](images.md)
- [Tables](tables.md)
- [Citations](citations.md)
- [Smart selection](smart-selection.md)
