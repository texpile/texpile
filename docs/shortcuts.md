---
nav: Keyboard shortcuts
description: The keyboard shortcuts specific to Texpile, grouped by where you are.
blurb: Texpile's own shortcuts, by context.
icon: keyboard
order: 36
section: Customize
---

# Keyboard shortcuts

On macOS, use Cmd for Ctrl and Option for Alt unless stated otherwise.

## Change a shortcut

Preferences › Keyboard Shortcuts lists every command and its keys. You can modify them visually.

## Edit directly

In many cases it is probably easier to edit the JSON directly: Command palette › Open Keyboard Shortcuts (JSON).

```jsonc
[
	{ "key": "mod+j", "command": "editor.bold" },
	{ "key": "mod+b", "command": "-editor.bold" }
]
```

| Field     | Type   | Default | Description                                                                                                                                                      |
| --------- | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `key`     | string |         | The keys, such as `mod+shift+k`. `mod` is Cmd on macOS and Ctrl elsewhere. Two keys separated by a space are pressed one after the other, such as `mod+k mod+s`. |
| `command` | string |         | The command's ID. Right-click a command in Preferences › Keyboard Shortcuts › Copy Command ID. A `-` in front removes a default key, such as `-editor.bold`.     |
| `when`    | string | always  | Where the key works, such as `sourceEditorFocus && editorLanguage == latex`. Combine keys with `&&`, `\|\|`, `!`, `==`, `!=` and parentheses.                    |
| `args`    | any    | none    | Passed to the command.                                                                                                                                           |

Keys: `a` to `z`, `0` to `9`, `f1` to `f24`, `enter`, `tab`, `space`, `backspace`, `delete`, `escape`, `insert`, `home`, `end`, `pageup`, `pagedown`, `up`, `down`, `left`, `right`, and ``; = , - . / ` [ \ ] '``. Modifiers: `mod`, `ctrl`, `shift`, `alt` (`option` on macOS) and `cmd` (`win` on Windows).

| `when` key                      | True when                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `sourceEditorFocus`             | The source editor has the focus                                                  |
| `visualEditorFocus`             | The visual editor has the focus                                                  |
| `editorLanguage`                | The focused editor's language: `latex`, `typst`, `markdown`, `bibtex` or `other` |
| `inputFocus`                    | A text field has the focus                                                       |
| `textInputFocus`                | A text field, an editor or the terminal has the focus                            |
| `terminalFocus`                 | The terminal has the focus                                                       |
| `dialogFocus`                   | A dialog has the focus                                                           |
| `editorKeymap`                  | The source editor's keybindings: `default`, `vim` or `emacs`                     |
| `isMac`, `isWindows`, `isLinux` | The system Texpile runs on                                                       |

## Anywhere

| Shortcut       | Action                                                                        |
| -------------- | ----------------------------------------------------------------------------- |
| Ctrl K         | Command palette (also Ctrl Shift P)                                           |
| Ctrl T         | Go to file                                                                    |
| Ctrl Alt Enter | Compile, or stop a running compile                                            |
| Ctrl Shift F   | Find in files                                                                 |
| Alt Z          | Insert a citation from Zotero (Cmd Option Z on macOS)                         |
| Ctrl Shift G   | Source Control, with the cursor in the message box (Control Shift G on macOS) |
| Ctrl Enter     | Commit, from the Source Control message box                                   |
| F8             | Next spelling problem                                                         |
| Shift F8       | Previous spelling problem                                                     |

## Formatting

| Shortcut           | Action                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| Ctrl \`            | Inline code                                                                      |
| Ctrl Shift \`      | Code block                                                                       |
| Ctrl M             | Inline math                                                                      |
| Ctrl Shift M       | Display math                                                                     |
| Ctrl .             | Superscript (LaTeX, Typst)                                                       |
| Ctrl Shift ,       | Subscript (LaTeX, Typst)                                                         |
| Ctrl Shift X       | Strikethrough (Markdown)                                                         |
| Ctrl Shift B       | Block quote (LaTeX, Markdown; Typst in the source editor only)                   |
| Ctrl Alt 1, 2, 3   | Heading 1, 2, 3 (`\section` to `\subsubsection` in the LaTeX source editor)      |
| Ctrl Alt 4, 5, 6   | Heading 4, 5, 6 (Typst, Markdown)                                                |
| Ctrl Shift 1, 2, 3 | Heading 1, 2, 3, for layouts where Ctrl Alt types a character. Windows and Linux |
| Ctrl Alt 0         | Back to a paragraph (visual editor; Typst and Markdown source)                   |

## Visual editor

| Shortcut    | Action                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Shift Enter | New display equation of the same kind, from inside a display equation                                 |
| Ctrl Enter  | Leave a code block                                                                                    |
| Tab         | Switch between `\indent` and `\noindent` in a LaTeX paragraph outside a table or list (Shift Tab too) |

## Source editor

| Shortcut         | Action                                                                          |
| ---------------- | ------------------------------------------------------------------------------- |
| F12              | Go to the definition of a label, macro, citation, or `\input` (also Ctrl click) |
| F2               | Rename a Typst symbol in every file                                             |
| Alt Enter        | Quick fixes (Typst)                                                             |
| Ctrl Space       | Open suggestions, or the symbol search inside math (Control Space on macOS)     |
| Ctrl Shift Space | Show the arguments of the command around the cursor (Cmd Shift Space on macOS)  |
| Ctrl Shift [     | Fold the block at the cursor (Cmd Option [ on macOS)                            |
| Ctrl Shift ]     | Unfold the block at the cursor (Cmd Option ] on macOS)                          |
| Ctrl Alt [       | Fold every block (Control Option [ on macOS)                                    |
| Ctrl Alt ]       | Unfold every block (Control Option ] on macOS)                                  |
| Tab              | Accept the starter text in an empty .tex file                                   |
| Esc              | Hide the math preview until the cursor leaves the math                          |
| Alt F5           | Next change since the last commit                                               |
| Shift Alt F5     | Previous change since the last commit                                           |
