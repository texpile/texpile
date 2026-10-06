---
nav: Formats
description: Which file types Texpile opens, what each one opens in, and which features differ between LaTeX, Typst and Markdown.
blurb: What opens where, and which features work in LaTeX, Typst and Markdown.
order: 4
---

# Supported file types and formats

## What opens where

| File                                                 | Opens in                             |
| ---------------------------------------------------- | ------------------------------------ |
| `.tex`, `.typ`, `.md`, `.markdown`                   | Visual editor or source editor       |
| `.bib`                                               | Bibliography editor or source editor |
| `.sty`, `.cls`, `.bbl` and other text files          | Source editor only                   |
| Images (PNG, JPEG, GIF, SVG, WebP, BMP, ICO) and PDF | A viewer                             |
| Other binary files                                   | Read only                            |

The main file sets the format: a `.typ` main file compiles with Typst, any other with LaTeX. Markdown has no compile step.

A `.tex`, `.sty`, `.cls`, `.tikz`, `.typ` or `.bib` file opened from your file manager opens without its folder, so without compile, Git, terminal, search in files, comments, sharing or the Agent tab. Click **Open in Workspace** to get them.

## Where the formats differ

Editing, spell check, comments, suggestions, the contents panel, word count, version control, shared sessions, MCP and Refine work in all three.

| Feature                             | LaTeX                                        | Typst                                      | Markdown                            |
| ----------------------------------- | -------------------------------------------- | ------------------------------------------ | ----------------------------------- |
| Compile to PDF                      | Yes                                          | Yes                                        | No                                  |
| Preview as you type                 | Live preview, off by default, needs lualatex | Preview, on by default                     | The visual editor is the preview    |
| Export                              | Save the live preview as a PDF               | PDF (with PDF/A or PDF/UA), PNG, SVG, HTML | No                                  |
| Jump between source and PDF         | Yes (SyncTeX)                                | Yes, both ways, while Preview is on        | No                                  |
| Completion, hover, live errors      | Yes                                          | Yes                                        | File paths in links and images only |
| Go to definition, Format Document   | Yes                                          | Yes (Format Document in the source editor) | No                                  |
| Type @ to cite, Zotero, cite by DOI | Yes                                          | Yes                                        | No                                  |
| Bibliography files                  | `.bib`                                       | `.bib` and Hayagriva `.yml`                | None                                |
| Templates                           | Built-in starters                            | Built-in starters and Typst Universe       | None                                |
