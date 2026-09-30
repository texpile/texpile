---
nav: Export
description: Export a Typst document from Texpile as PDF, with a PDF/A or PDF/UA standard and tagging, as PNG or SVG images, or as HTML, through tinymist.
blurb: PDF with standards, PNG and SVG images, or HTML, through tinymist.
icon: file-text
order: 2
---

# Export

Export writes the main Typst document as a PDF, as PNG or SVG images, or as HTML. It goes through tinymist, and includes edits you have not saved.

| Where to find it | Path                                   | Note                          |
| ---------------- | -------------------------------------- | ----------------------------- |
| Menu             | File › Export…                         | When the main file is a .typ. |
| Toolbar          | The Export button in the Typst preview | Beside Save as PDF.           |
| Shortcut         | Ctrl+K                                 | Then "Export Typst Document". |

The dialog remembers its last choices, and the folder the last export went to, for each folder you open. The page range starts empty every time.

## Formats

- **PDF.** A page range, a standard, and tagging. The standard is a PDF version (1.4 to 2.0) or a PDF/A archival level (PDF/A-1b to PDF/A-4e). PDF/UA-1 can be added for accessibility, except with PDF 2.0 or PDF/A-4, and needs a document title: `#set document(title: [...])`. Tagged PDF, on by default, adds the structure screen readers follow. PDF/UA-1 and the level A standards keep it on.
- **PNG.** A page range, a resolution in pixels per inch, and one image for all the pages or one file per page. One image can have a background color behind whatever the pages leave transparent.
- **SVG.** A page range, and one image or one file per page.
- **HTML.** Typst's HTML export, which is experimental. It follows the document's structure rather than its pages.

Pages are written the way Typst reads them: `1-3, 5, 8-`.

## Where the files go

Export asks where to save the file. One file per page asks for a folder instead, and names the pages after the main file: `thesis-1.png`, `thesis-2.png`, and so on, with leading zeros once there are ten or more. Exporting again replaces them.

If tinymist cannot export, the dialog says why: a document that does not compile, or one that breaks the standard you picked, such as PDF/UA-1 without a title.

> [!NOTE]
> Export needs tinymist installed. Save as PDF in the preview toolbar still saves a plain PDF in one click.

[Live preview](live-preview.md)
[Typst](README.md)
