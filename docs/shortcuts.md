---
nav: Keyboard shortcuts
description: The keyboard shortcuts specific to Texpile, grouped by where you are.
blurb: Texpile's own shortcuts, by context.
icon: keyboard
order: 35
section: Customize
---

# Keyboard shortcuts

On macOS, use Cmd for Ctrl and Option for Alt, unless a row says otherwise.

## Anywhere

| Shortcut       | Action                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| Ctrl K         | Command palette (also Ctrl Shift P)                                           |
| Ctrl T         | Go to file                                                                    |
| Ctrl Alt Enter | Compile, or stop a running compile                                            |
| Ctrl Shift F   | Find in files                                                                 |
| Ctrl Shift G   | Source Control, with the cursor in the message box (Control Shift G on macOS) |
| Ctrl Enter     | Commit, from the Source Control message box                                   |
| F8             | Next spelling problem                                                         |
| Shift F8       | Previous spelling problem                                                     |

## Formatting

| Shortcut           | Action                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Ctrl \`            | Inline code                                                                                      |
| Ctrl Shift \`      | Code block                                                                                       |
| Ctrl M             | Inline math                                                                                      |
| Ctrl Shift M       | Display math                                                                                     |
| Ctrl .             | Superscript (LaTeX, Typst)                                                                       |
| Ctrl Shift ,       | Subscript (LaTeX, Typst)                                                                         |
| Ctrl Shift X       | Strikethrough (Markdown)                                                                         |
| Ctrl Shift B       | Block quote (LaTeX, Markdown; Typst in the source editor only)                                   |
| Ctrl Alt 1, 2, 3   | Heading 1, 2, 3 (`\section` to `\subsubsection` in the LaTeX source editor)                      |
| Ctrl Alt 4, 5, 6   | Heading 4, 5, 6 (Typst, Markdown)                                                                |
| Ctrl Shift 1, 2, 3 | Heading 1, 2, 3 in the visual editor, for layouts where Ctrl Alt types a character. Not on macOS |
| Ctrl Alt 0         | Back to a paragraph (visual editor; Typst and Markdown source)                                   |

## Visual editor

| Shortcut    | Action                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Shift Enter | New display equation of the same kind, from inside a display equation                                 |
| Ctrl Enter  | Leave a code block                                                                                    |
| Tab         | Switch between `\indent` and `\noindent` in a LaTeX paragraph outside a table or list (Shift Tab too) |

## Source editor

| Shortcut     | Action                                                                          |
| ------------ | ------------------------------------------------------------------------------- |
| F12          | Go to the definition of a label, macro, citation, or `\input` (also Ctrl click) |
| F2           | Rename a Typst symbol in every file                                             |
| Alt Enter    | Quick fixes (Typst)                                                             |
| Ctrl Space   | Open suggestions (Control Space on macOS)                                       |
| Tab          | Accept the starter text in an empty .tex file                                   |
| Esc          | Hide the math preview until the cursor leaves the math                          |
| Alt F5       | Next change since the last commit                                               |
| Shift Alt F5 | Previous change since the last commit                                           |
