---
nav: Overview
description: What Texpile does for LaTeX, Typst, and Markdown: which features apply to each format, and where the three differ.
blurb: Which features apply to LaTeX, Typst, and Markdown, and where they differ.
icon: layers
order: 10
section: Formats
---

# Formats

Texpile edits LaTeX, Typst, and Markdown. The editor is the same for all three. What differs is how a document is compiled and previewed, and a few things the visual editor can show in one format and not another.

| Feature                                           | LaTeX                           | Typst                             | Markdown                            |
| ------------------------------------------------- | ------------------------------- | --------------------------------- | ----------------------------------- |
| Visual editing                                    | Yes                             | Yes                               | Yes                                 |
| Source editing, keymaps, multiple cursors         | Yes                             | Yes                               | Yes                                 |
| Preview as you type                               | Yes, with your TeX distribution | Yes, on by default, with tinymist | The visual editor is the preview    |
| Compile to PDF                                    | Yes                             | Yes                               | No                                  |
| Completion, hover, and errors as you type         | Yes                             | Yes, from tinymist                | File paths in links and images only |
| Jump between source and preview                   | SyncTeX, in source mode         | Yes, both ways                    | No                                  |
| @ picker for citations and references             | Yes                             | Yes                               | No                                  |
| Zotero                                            | Yes                             | Yes                               | No                                  |
| Spell check, comments, contents panel, word count | Yes                             | Yes                               | Yes                                 |
| Version control, shared sessions, MCP             | Yes                             | Yes                               | Yes                                 |
| Needs a program installed                         | A TeX distribution              | tinymist                          | Nothing                             |

The rest of the docs describe LaTeX where the formats differ. One page per format says what is its own:

- [LaTeX](latex/README.md)
- [Typst](typst/README.md)
- [Markdown](markdown.md)
