# A second Markdown file

This file exists so that cross-file behaviour has somewhere to go: link completion, the file
tree, tab switching, and find-in-files all need more than one document.

## Linking between files

Back to [the sweep](notes.md), and to a heading inside it:
[the math section](notes.md#math).

Into the other projects:

- [the LaTeX document](../latex/main.tex)
- [the Typst document](../typst/main.typ)
- [the shared bibliography](../latex/refs.bib)

## A short checklist

- [x] Open this file in the visual editor
- [x] Switch to source and back
- [ ] Confirm nothing in the file changed
- [ ] Confirm the caret landed in the same place

## A code sample

```bash
# from the repository root
pnpm install
pnpm electron:dev
```

## A table of the projects

| Folder     | Format   | Main file   | Compiles with        |
| ---------- | -------- | ----------- | -------------------- |
| `latex/`   | LaTeX    | `main.tex`  | `latexmk -pdf`       |
| `typst/`   | Typst    | `main.typ`  | `typst compile`      |
| `markdown/`| Markdown | `notes.md`  | nothing; preview only|

> Each folder is meant to be opened as its own workspace, since the compile command is stored
> per folder.
