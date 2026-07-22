# Changelog

Release notes for Texpile Desktop. Add notes under `## [Unreleased]` as you work; run
`pnpm --filter texpile-editor release <patch|minor|major>` to cut a dated, numbered release.

## [Unreleased]

- feat: the app and the website are available in Simplified Chinese, Traditional Chinese, and German; pick a language in Preferences
- feat: machine-translated languages are marked as such, and switching to one shows where translation mistakes can be reported
- feat: work in several windows: File > New Window and Open Folder in New Window; a folder opens in one window at a time, and opening it again focuses that window
- feat: relaunching the app reopens every window from the last session, each on its last open file
- feat: window titles show the file and folder, so windows are easy to tell apart in the taskbar
- feat: live mode runs in one window at a time; another window can take it over with a click
- fix: preferences changed in one window no longer overwrite changes made in another
- feat: select several files in the file explorer with Ctrl and Shift click, then move or delete them together
- fix: dragging in the file explorer highlights the folder that would receive the drop, instead of the whole panel
- feat: drop files or folders from your system's file manager onto the file explorer to copy them into the project
- feat: paste an image or copied files into the file explorer with Ctrl+V; pasted screenshots are saved as pasted-image.png
- feat: drag files from one window's file explorer into another window to copy them across projects
- feat: experimental shared sessions: share a folder for real time editing, guests join with a code from the home screen, no account needed
- feat: shared sessions are end to end encrypted; the relay server only forwards data it cannot read
- feat: guests see the host's compiled PDF live and can request a compile; compiling with shell escape is disabled while sharing
- feat: shared sessions cover the visual editor, not just source; edits sync both ways and you see where collaborators are editing
- feat: guests can see compile problems in a Problems panel without opening a terminal
- feat: the share dialog notes that anyone with the code can edit the folder's files, and shows how many people can join
- feat: open files appear as tabs above the editor, and your open tabs come back when you reopen the folder
- feat: the compiled PDF refreshes in place after each compile, keeping your scroll position without a flash
- fix: once you choose a main file it sticks, instead of the prompt returning every time you open the folder
- fix: renaming, moving, or reloading the open file no longer loses unsaved edits

## [0.14.3] - 2026-07-18

- fix: the What's new, update, and Preferences windows scroll long content instead of pushing their buttons off screen, and Esc closes them
- fix: arrow keys no longer open autocomplete while moving the cursor
- feat: automatic update notices wait until a release is 3 hours old; a manual check from the menu shows it right away
- feat: the keyboard shortcuts window lists the source editor keys (go to definition, suggestions, math preview)

## [0.14.2] - 2026-07-18

- feat: spell check works in the source editor, checking prose but not commands, math, or comments
- feat: autocomplete knows package and class names, per-package options and key-values, and bib entry types
- feat: autocomplete suggests labels with their numbers, your macros, and glossary entries from every file in the project
- feat: go-to-definition and hover work across files, and citation suggestions are searchable
- feat: accepting a macro that takes an argument reopens the suggestions for that argument
- feat: the math preview renders your own macros and can be dismissed with a click or Esc, with a Preferences toggle
- fix: compile problems are read more accurately from MikTeX, pdfTeX, and dvipdfmx logs, and squiggles land on the exact token
- feat: bibliography warnings jump to the entry in the .bib file
- fix: reading the compile log no longer stalls the app on large documents
- feat: reopening the last workspace also restores the last open file
- feat: live mode renders exact pages at rest, and large documents only paint the pages in view
- feat: live mode covers footnotes, beamer slides, tables inside floats, CJK text, and classic math fonts
- fix: steadier typing in live mode, with fewer misplaced or drifting edits
- fix: the Linux deb launches on Ubuntu 24.04 and newer
- fix: the app icon appears in the Ubuntu launcher, and the Linux dock says Texpile instead of Texpile-desktop

## [0.14.1] - 2026-07-17

- fix: the source editor's line numbers sit between the warning and fold columns, so they no longer have a gap beside them
- fix: double-clicking a line number or a fold arrow no longer selects it

## [0.14.0] - 2026-07-16

- feat: the source editor gets a table inserter and a math symbol palette
- feat: autocomplete completes more macros and opens with a single backslash
- feat: a new .tex in source mode offers a document skeleton you can take with Tab
- feat: the terminal can shrink to the editor width
- fix: File > New waits for you to name the file instead of creating untitled.tex before you can type
- fix: switching files no longer flashes a placeholder before the editor appears
- fix: the math symbol palette no longer disappears when switching between symbol groups
- fix: the line number column keeps a steady width

## [0.13.2] - 2026-07-15

- feat: the What's New window shows the current release series on new installs and upgrades from older versions

## [0.13.1] - 2026-07-15

- fix: applying a highlight or text color to selected text froze the app
- feat: updates now download and install from inside the app

## [0.13.0] - 2026-07-14

- feat: added live mode, allowing real-time preview of LuaLaTeX compilation
- feat: various minor improvements to the user experience
