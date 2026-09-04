---
description: Texpile's source editor: syntax highlighting, Vim and Emacs keymaps, multiple cursors, an inline math preview, and go-to-definition across files.
blurb: A code editor with Vim and Emacs keymaps, multiple cursors, and a math preview.
icon: code
order: 4
section: Editor
---

# Source editing

A code editor with syntax highlighting, showing the same document as the visual editor.

| Where to find it | Path                              | Note                            |
| ---------------- | --------------------------------- | ------------------------------- |
| In the editor    | The Visual / Source toggle        | Top right corner of the editor. |
| Setting          | File › Preferences… › Keybindings | Default, Vim, or Emacs.         |

![A .tex file open in the source editor with syntax highlighting](../landing/src/lib/assets/showcase/editor-source.webp 'A .tex file open in the source editor with syntax highlighting')

- Keybindings: default, Vim, or Emacs, in Preferences.
- Multiple cursors: Ctrl+Alt+Up and Ctrl+Alt+Down add one, Ctrl+D selects the next occurrence.
- Equations preview as you type them, using your own macros. Esc hides the preview, and Preferences › Math preview turns it off.
- F12, or Ctrl+Click, goes to where a macro, label, or citation is defined, across files.
- The toolbar has the formatting commands, a table inserter, and a math symbol palette.

![The source editor's table-insert grid, with caption, rules, and header-row toggles](../landing/src/lib/assets/showcase/app/table-grid-picker.png) ![The source editor's math symbol dropdown, open on the Common tab](../landing/src/lib/assets/showcase/app/math-palette.png)

[All keyboard shortcuts](shortcuts.md)
