# Changelog

Release notes for Texpile Desktop. Add notes under `## [Unreleased]` as you work; run
`pnpm --filter texpile-editor release <patch|minor|major>` to cut a dated, numbered release.

## [Unreleased]

- fix: improved launch speed
- fix: editor now correctly handles bbl files
- fix: various improvements in the visual editor
- fix: live preview reads section, footnote and list numbers from the engine, so more edits render exactly instead of provisionally
- fix: live preview no longer stalls on paragraphs with \verb or \url
- fix: editing an abstract or other narrowed block now patches instantly instead of waiting for a full recompile
- fix: edits that need a full recompile now highlight where the change will land while it runs
- fix: the table of contents and cross-references no longer stay empty or show ?? in live preview
- fix: instant patches now ask the engine whether the edited page still fits and read stretched spacing from it, instead of guessing
- fix: the engine fit check now works on many more document classes instead of refusing pages with invisible layout rules
- fix: when an edit pushes lines past the column or page bottom, the preview now shows them flowing into the next column or page instead of cramming them at the bottom
- fix: the engine fit check counts an unusually deep last line against the page the way the page builder does
- fix: the compile now records the spacing TeX discards at every column and page break, so lines that flow across a break land on the engine's own spacing instead of a guess
- fix: content pushed across breaks can now ripple through several columns and pages in one keystroke, each step decided by the engine, and renders exactly with no refining tint when every step is certified
- fix: deleting lines now pulls content back from the next column or page live, instead of leaving a gap until the recompile
- fix: live preview reads the spacing between every pair of lines from the engine instead of deriving it, so the break check works from the document's real vertical list
- fix: pages of documents that shift the page origin no longer render offset in live preview
- fix: live preview reads each page's columns from the engine instead of inferring them from where text starts, so edits land in the right column even when the gap between columns is narrow
- fix: the compile now records which line of your document produced each line of the page, so live preview finds the text you edited by asking instead of searching, and instant edits land about a third faster
- fix: editing one column of a two-column page no longer moves a figure that spans both columns, or the page number
- fix: two figures included at the same size can no longer be shown in each other's place in live preview
- fix: live preview flows content across a column break in more documents, instead of giving up when a column held only a figure
- fix: an edit that pushes content into the next column or page now renders exactly, with no refining tint, on the last page and in document styles that leave the bottom of pages ragged
- fix: an edit the engine confirmed still fits the page no longer shows the refining tint because a size estimate disagreed with it
- fix: a page containing a fraction or other stacked maths no longer falls back to the slower refining render for every edit on it
- fix: live preview reads a narrowed block's own type size and leading from the compile, so edits in an abstract, quote or footnote are placed by asking rather than searching for them
- fix: live preview no longer misses a superscript, accent or inline maths on a paragraph's first or last line when matching it, which used to send those paragraphs down the slower path
- fix: a paragraph continued in the next column or on the next page now renders exactly when the break stays where it was, instead of always showing the refining tint
- fix: editing a paragraph that continues in the next column no longer places it wrongly when a figure sits at the bottom of that column

## [0.17.1] - 2026-08-19

- feat: Typst tables in the visual editor: merge and split cells, and drag to resize columns
- feat: Typst completions, hover help, and live error underlines for guests in a shared session, with no Typst tools installed on their machine
- fix: accepting a Typst completion could leave the cursor before the inserted word
- fix: LaTeX and Markdown tables no longer show a column resize handle that could not be saved
- fix: removed the legacy window size warning

## [0.17.0] - 2026-08-15

- feat: Typst support: visual editor, tinymist live preview, and click-to-jump sync in both directions
- feat: visual Markdown editing
- feat: review comments on LaTeX, Markdown and Typst documents, also in shared sessions
- feat: Zotero citation integration: insert citations from the right-click menu or command palette, with a toggle in the new Integrations preferences tab
- feat: undo/redo for file tree operations
- feat: project build settings now live in .texpile/config.json inside the workspace and migrate automatically from 0.16.1
- feat: many UI enhancements
- fix: many collaboration, editor, and preview stability fixes

## [0.16.1] - 2026-08-02

- feat: the editor remembers where you left off in each file, across tab switches and restarts
- feat: toolbars fold into a "..." when the window is narrow, instead of putting buttons out of reach
- fix: math symbols insert reliably from the toolbar, and equations no longer steal the cursor

## [0.16.0] - 2026-07-31

- feat: a command palette on Ctrl+K (Cmd+K on macOS) to open a file, compile, and run editor actions without leaving the keyboard. The file name in the middle of the title bar opens it too
- feat: Vim and Emacs keybindings for the source editor, chosen in Preferences
- feat: multiple cursors in the source editor: Ctrl+Alt+Up and Ctrl+Alt+Down add a cursor, Ctrl+D selects the next occurrence
- feat: the window title bar is now part of the app, putting the menus, the file name, and the window buttons on one row; the menus fold into a single button as the window narrows. macOS keeps its native menu bar and traffic lights
- feat: connect Claude and other AI assistants to the editor over MCP, set up from Preferences
- feat: large documents open, scroll, and type faster
- feat: on Windows and Linux the window buttons are drawn by the system, so hovering Maximise on Windows 11 offers the snap layouts
- fix: live mode no longer showed a blank grey page for any document that picks its font with fontspec. A family name containing a space, such as Times New Roman, made the page unreadable to the preview; this affected every language, English included
- fix: Hebrew and Arabic render in live mode, reading right to left, with Arabic letters joined
- fix: Greek, Cyrillic, and Japanese, Chinese, and Korean text render in live mode, including fonts taken from a TrueType collection
- fix: live mode reports compile errors in the Problems panel. A document that still produced pages could fail silently, with nothing anywhere to say why
- fix: typing in a right-to-left document no longer recompiles on every keystroke
- fix: the macOS menu bar was missing every menu but Edit, and Window and Help were left in English
- fix: in a shared session the PDF preview no longer stops working partway through
- fix: guests in a shared session have the menus, with the actions a guest cannot perform left out
- fix: the file explorer refreshes when you open another folder from within a workspace
- fix: two compiles can no longer run at once and overwrite each other's output
- fix: compiling no longer opens an empty terminal alongside the compile output

## [0.15.0] - 2026-07-22

- feat: experimental shared sessions for real time collaboration. Share a folder with a code from the home screen, no account needed, end to end encrypted so the relay server only forwards data it cannot read. Guests co-edit in both the visual and source editors, see where others are editing, and watch the host's compiled PDF and compile problems live
- feat: work in several windows, with File > New Window and Open Folder in New Window; relaunching reopens every window on its last open file
- feat: the app and the website are available in Simplified Chinese, Traditional Chinese, and German, picked in Preferences
- feat: open files appear as tabs above the editor, and your open tabs come back when you reopen the folder
- feat: the file explorer gains multi-select and drag and drop: select several files with Ctrl and Shift, drop files and folders in from your system's file manager, and paste images or copied files with Ctrl+V

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
