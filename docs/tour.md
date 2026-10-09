---
description: A tour of the Texpile window: the menus, the sidebar, tabs, the editor, the PDF, the bottom panel, and the layout.
blurb: The window, part by part: menus, sidebar, tabs, editor, preview, and bottom panel.
icon: layers
order: 3
section: Get started
---

# A tour of the window

A LaTeX project, with the PDF and the bottom panel open.

![The Texpile window with nine parts marked](../landing/src/lib/assets/showcase/docs/app/tour-window.png)

1. **Menus.** On macOS they are in the system menu bar, with a Texpile menu added.
2. **Window title.** Click it, or press Ctrl K, for the [command palette](command-palette.md).
3. **Files.** The project folder. The star marks the main file.
4. **Contents.** The headings of the paper the open file belongs to. Click one to go there.
5. **Tabs.** Ctrl Shift T reopens the last closed tab.
6. **Editor.** The visual editor, or the source editor.
7. **PDF.** The bar on the editor's right edge shows and hides it.
8. **Bottom panel.** Terminal › Show Terminal opens it.
9. **Layout.** Shows and hides the sidebar, the bottom panel and the PDF, and splits the editor or the PDF. See [Layout](#layout).

## Editor and PDF bars

![The bars above the editor and the PDF, with five controls marked](../landing/src/lib/assets/showcase/docs/app/tour-bars.png)

1. **Visual / Source.** Switch editors. Each editor has its own switch.
2. **Word count.** Select text to count the selection. Hover for the whole paper.
3. **Compile.** The menu beside it has the compile settings.
4. **Problems.** Errors and warnings from the last compile.
5. **Editing / Suggesting.** In Suggesting, your edits become suggestions others can accept.

With the PDF closed, Problems and Editing / Suggesting move to the title bar, and **Show PDF** opens the PDF. Ctrl Alt Enter compiles either way.

Edits save on their own a moment after you stop typing. Ctrl S (Cmd S on macOS) saves right away.

## Layout

![The Layout menu, with Panels, Editors and Preview](../landing/src/lib/assets/showcase/docs/app/tour-layout.png)

- **Panels** shows and hides the sidebar, the terminal and the PDF.
- **Editors** shows one editor, two side by side, two stacked, or four in a grid. See [Split view](split-view.md).
- **Preview** splits the PDF into two views, one above the other, or opens it in a window of its own.

## Sidebar

![The sidebar header and the file tree](../landing/src/lib/assets/showcase/docs/app/tour-sidebar.png)

The number on the Source Control button is how many files changed. Esc returns from Source Control or Find in Files to the files.

## Bottom panel

![The bottom panel open on Problems](../landing/src/lib/assets/showcase/docs/app/tour-bottom.png)

The Agent tab is a chat with an AI agent on your computer. It is hidden when every agent is turned off in Preferences › AI Assistant.

## Menus

| Menu     | What is in it                                                                                                                                                                                |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File     | New, Open Folder, Clone Repository…, New Window, Open Folder in New Window…, Save, Save as Template…, Version History…, Restore Deleted File…, Close Workspace, Shared Session, Preferences… |
| Edit     | Command Palette, Go to File, Undo, Redo, Find…                                                                                                                                               |
| View     | Zoom In, Zoom Out, Reset Zoom                                                                                                                                                                |
| Insert   | Math, Image…, Table, Link…, References, Symbol…, and the rest for your file type                                                                                                             |
| Format   | Bold, Italic, Underline, Text Style, Headings, Block Quote, Format Document                                                                                                                  |
| Spelling | Check Spelling & Grammar, Edit Dictionary…, Spelling and Grammar Settings…                                                                                                                   |
| Terminal | Compile, Configure Compile Command…, New Terminal, Show Terminal                                                                                                                             |
| Help     | Keyboard Shortcuts, Open Tutorial, What's New, Documentation, Join Discord, Report a Problem…, Check for Updates                                                                             |
