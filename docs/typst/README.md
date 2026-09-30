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

| Where to find it | Path                         | Note                                                                            |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------- |
| In the editor    | Open any .typ file           | Set it as the main file to compile or preview it.                               |
| In the editor    | Open an empty folder › Typst | A paper, a report or thesis, a letter, or slides, and more from Typst Universe. |

![A Typst document in the visual editor: headings with their labels, formatted text, and lists](../../landing/src/lib/assets/showcase/app/typst-visual.png 'A Typst document in the visual editor: headings with their labels, formatted text, and lists')

## What differs

- A label such as `<sec:intro>` shows under its heading, and @ inserts a reference to a label or a citation key.
- A function call wrapping content on lines of its own, such as `#theorem[...]` or `#align(center)[...]`, shows as a box: the function, its arguments as Typst, and its label along the top, the content below, edited like the rest of the page. Insert › Typst Source › Environment… adds one, offering the functions your document defines with `#let` first.
- Anything the visual editor cannot show stays in place as a Typst code chip.
- Footnotes, page and column breaks, `#v` and `#h` spaces, and `#outline` show as what they print, footnotes numbered in order. Click one for its settings.
- The set rules for the page, text, paragraphs, headings, the document, and equations show as one line each, such as Page · A4 · 2.5cm margins. Click one to change the common settings. Anything else a rule sets is kept as written, and a rule with `if` or `..` stays a code chip.
- Insert has References, Breaks and Spaces, Document Parts, and Typst Source submenus. Insert › References › Cross-reference types the @ that opens the picker.
- Completion, hover help, and errors as you type come from tinymist, for guests in a shared session too. tinymist also warns about a font name it cannot find, with the names you probably meant, and a `#set` or `#show` rule that cannot take effect where it is.
- Every file is checked as part of the main file, so a chapter's references to labels and citations elsewhere in the document resolve.
- In source mode, the outline lists the headings. Enter continues a list, an enumeration, or a doc comment, and opens an empty `$ $` into a display equation.
- F12, or Ctrl+Click, goes to a definition in the project, in another file too, or opens the file a path names, such as an image or an included chapter. Alt+Enter offers tinymist's quick fixes where the caret is, such as creating a missing file or wrapping an image in a figure.
- A swatch sits beside each color in the source. Click it to pick a new color.

## Symbols

Every named Typst symbol and emoji, found by name, by what it means, or by shorthand.

| Where to find it | Path                           | Note                                 |
| ---------------- | ------------------------------ | ------------------------------------ |
| Menu             | Insert › Symbol…               | In the visual and the source editor. |
| In the editor    | The Ω button on the source bar | Next to the equation buttons.        |
| Shortcut         | Ctrl+K                         | Then "Insert Symbol".                |

- Type a name (`arrow.r.double`), what it means (arrow right double, not equal), a shorthand (`=>`), or paste the character. Or browse the tabs. The symbols you used last come first.
- The arrow keys move through the grid, Enter inserts, and Esc closes.
- In an equation it writes the shorthand, or else the bare name: `=>`, `alpha`. In text it writes the character itself, or Typst's shorthand for it (`--` for an en dash, `~` for a no-break space). A character that would not show, such as a thin space, goes in by name: `#sym.space.thin`. In code it writes `sym.arrow.r`.
- In the visual editor the character goes into the text. A selected equation is kept and the symbol goes after it. Inside an equation, use the math toolbar.

The [Equations](../visual-editing/math.md), [Images](../visual-editing/images.md), [Tables](../visual-editing/tables.md), and [Citations](../visual-editing/citations.md) pages each end with what differs in Typst.

## Starting a Typst document

An empty folder offers Typst templates on its Typst tab: a paper with a title block, abstract, equation, figure, table, and citations; a report or thesis with a title page, a table of contents, and a file per chapter; a letter; and slides that start a new slide at every top-level heading. Each keeps its layout in `template.typ`, so `main.typ` holds only your text, and none of them needs a package or a network connection. Browse Typst Templates… goes online to Typst Universe for more. See [Templates](../projects.md#templates).

[Live preview](live-preview.md)
[Export](export.md)
[Installing tinymist](../installation/typst/README.md)
