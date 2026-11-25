---
nav: Convert to LaTeX
description: Turn a picture of an equation, table or diagram into LaTeX or Typst with your AI service.
order: 3.5
---

# Convert to LaTeX

Convert to LaTeX turns a picture of an equation, a table, a diagram or a page of text into source in the file's language. A LaTeX file gets LaTeX with a TikZ picture for a diagram, a Typst file gets Typst with a CeTZ canvas, and a Markdown file gets Markdown with LaTeX math.

> [!REQUIRES] an [AI service](README.md#set-up-an-agent) that reads pictures: Claude Code, Codex, or a custom service with such a model

- **Convert to LaTeX**: right-click a picture in the visual editor, or a line with `\includegraphics` or `image()` in the source editor. The result goes in below the picture.
- **Paste as LaTeX**: right-click anywhere you can type, with a picture on the clipboard. The result goes in at the caret.

The dialog shows the picture. Drag over it to convert part of it, then click **Convert Selection**. A large picture, such as a scan or a PDF page, waits for you to pick the part first. **Convert All** reads the whole picture.

The result shows drawn above its source. An equation is drawn as it will look, and a diagram is drawn by your own `lualatex` (TikZ) or `tinymist` (CeTZ). A diagram that fails to compile goes back to the service once with the error, and the fixed version is shown. **Insert** puts the source in your file, and adds `\usepackage{tikz}` or `amsmath` when the document needs it.

Both items are left out of the menu while the AI service is an agent that reads only text, such as Antigravity or a custom command. What is sent is in [Privacy](../reference/privacy.md).
