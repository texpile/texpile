---
description: Texpile treats the folder as the project: a file explorer with drag and drop, tabs, multi-file document support, find in files, and a table of contents.
blurb: The folder is the project: explorer, tabs, multi-file documents, search, and references.
icon: files
order: 6
section: Editor
---

# Projects and files

A paper is usually more than one file. Texpile treats the folder as the project, with no separate project file to keep in sync.

| Where to find it | Path              | Note                                               |
| ---------------- | ----------------- | -------------------------------------------------- |
| Panel            | The sidebar       | The file explorer, with Contents below it.         |
| Shortcut         | Ctrl+Shift+F      | Find in files.                                     |
| Shortcut         | Ctrl+K            | The command palette: open a file or run an action. |
| Menu             | File › New Window | Also File › Open folder in new window.             |

![The file explorer showing a multi-file paper](../landing/src/lib/assets/showcase/thumbs/thumb-tree.png#narrow 'The file explorer showing a multi-file paper')

## File explorer

Every file in the folder, with multi-select using Ctrl and Shift and drag and drop within the tree.

- Drag files and folders in from your system's file manager to import them.
- Ctrl+V pastes: a screenshot on your clipboard becomes a new image file, and copied files are copied in.
- Drag and drop within the tree to move files between folders.

## Tabs

Open files appear as tabs above the editor, and your open tabs come back when you reopen the folder.

## Multi-file documents

Files pulled in with `\input` are read with the main file's macros and packages, so a chapter opens on its own without losing them.

## Table of contents

A contents panel lists your headings, figures, tables, and beamer frames. Click an entry to jump to it.

## Word count

Words and characters for the whole document, or for the current selection.

## Getting around

The command palette opens files and runs editor actions without leaving the keyboard. You can also work in several windows at once, and relaunching reopens each on its last open file.

![The command palette open on Ctrl+K, listing compile, view, and editor actions](../landing/src/lib/assets/showcase/app/command-palette.png#narrow)

[All keyboard shortcuts](shortcuts.md)
