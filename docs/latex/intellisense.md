---
description: Texpile completes commands, packages, labels, citation keys, and file paths from across your whole LaTeX project, with go-to-definition and hover.
blurb: Completion, go-to-definition, and hover across your whole project.
icon: sparkles
order: 3
---

# Intellisense

Completion, go-to-definition, and hover in the source editor, drawing on your whole project rather than the open file.

| Where to find it | Path                           | Note                            |
| ---------------- | ------------------------------ | ------------------------------- |
| In the editor    | Always on in the source editor | Suggestions appear as you type. |
| Shortcut         | Ctrl+Space                     | Open suggestions.               |
| Shortcut         | F12, or Ctrl+Click             | Go to a definition.             |

![The source editor completing a citation with bibliography keys and titles](../../landing/src/lib/assets/showcase/intellisense-dark.png 'The source editor completing a citation with bibliography keys and titles')

Completion covers commands and environments, including your own macros, package and class names with their options, `\ref` labels with their numbers, `\cite` keys searchable by title and author, and file paths in `\input`, `\includegraphics`, and `\addbibresource`. Macros come from the main file and everything it includes. Labels and keys come from every file in the folder.
