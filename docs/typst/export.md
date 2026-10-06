---
nav: Export
description: Export a Typst document as PDF, with a PDF/A or PDF/UA standard, as PNG or SVG images, or as HTML.
blurb: PDF with standards, PNG and SVG images, or HTML.
icon: file-text
order: 9
---

# Export

Save the main document as a file: File › Export…, or the Export button in the preview.

![The Export dialog: Format, Pages, Standard, PDF/UA-1 and Tagged PDF](../../landing/src/lib/assets/showcase/docs/typst/export.png)

| Format | Options                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------ |
| PDF    | Pages, a standard such as PDF/A-2b, PDF/UA-1 for accessibility, and Tagged PDF.                                          |
| PNG    | Pages, the resolution in PPI (300 suits print), one image or one file per page, and a transparent or colored background. |
| SVG    | Pages, and one image or one file per page.                                                                               |
| HTML   | Typst's experimental HTML export, for the whole document.                                                                |

Pages take ranges such as `1-3, 5, 8-`. Empty means all pages. PDF/UA-1 needs a document title: `#set document(title: [...])`.
