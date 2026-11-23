# Changelog

Release notes for Texpile Desktop. Add notes under `## [Unreleased]` as you work; run
`pnpm --filter texpile-editor release <patch|minor|major>` to cut a dated, numbered release.

## [Unreleased]

- fix: two scrollbars in the insert menu beside a block (by @louisqli)
- feat: Delete block moves from the gutter into a menu that clicking the drag handle opens (by @louisqli)
- fix: figure picture not tinted when a selection runs into its caption (by @louisqli)
- fix: table guides showing on half of one cell under the pointer (by @louisqli)
- fix: scrolling stopping while the pointer is on the block handle (by @louisqli)
- fix: figure resize frame showing while hovering the caption (by @louisqli)
- feat: image Crop and Settings bar shows on hover (by @louisqli)
- fix: sideways scrollbar under the visual editor at 125 percent display scale (by @louisqli)
- fix: selection skipping empty lines between paragraphs in the visual editor (by @louisqli)
- fix: caret drawn thinner in some places than others at 125 percent display scale (by @louisqli)
- fix: typing after Ctrl+A in an empty document leaving the text selected and keys ignored (by @louisqli)
- fix: block handle staying beside a row while typing in the visual editor (by @louisqli)
- fix: raw LaTeX command over several lines outlined line by line in the visual editor (by @louisqli)
- fix: caret ending at the bottom edge of the pane after Ctrl+End in the visual editor (by @louisqli)
- fix: double-click not opening a TikZ figure in the visual editor (by @louisqli)
- fix: slide column width shown as plain text in the visual editor (by @louisqli)
- fix: slide settings button missing in the visual editor (by @louisqli)
- feat: canvas visual editor (by @louisqli)
- feat: title bar search box stays centered on the window (by @louisqli)
- feat: Layout button shows its icon only (by @louisqli)
- feat: improved Spanish translation (by @nicolobos77)
- feat: improved Português translation (by @rodrigo-alessantos)
- fix: End in a code block going to the start of the next line in the visual editor (by @louisqli)
- fix: Ctrl+/ in an inline raw LaTeX chip commenting out the rest of the paragraph in the visual editor (by @louisqli)
- fix: Ctrl+Up and Ctrl+Down not going to the start and end of a paragraph in the visual editor (by @louisqli)
- fix: Backspace at the start of a quote not taking the paragraph out of the quote in the visual editor (by @louisqli)
- fix: Enter in a table cell not going to the cell below in the visual editor (by @louisqli)
- fix: Enter in a table caption not going to the first cell in the visual editor (by @louisqli)
- fix: text copied from a code block pasting with formatting in the visual editor (by @louisqli)
- fix: formatted text pasted into a code block keeping its markup in the visual editor (by @louisqli)
- fix: Enter on a selected raw LaTeX chip not opening it in the visual editor (by @louisqli)
- fix: Ctrl+/ in a plain code block wrapping lines in Markdown comments in the visual editor (by @louisqli)
- fix: Escape in Find not returning to the text in the visual editor (by @louisqli)
- fix: Ctrl+F not filling Find with the selected text in the visual editor (by @louisqli)
- fix: arrow keys not moving through the right-click menu in the visual editor (by @louisqli)
- fix: Cut missing from the right-click menu in the visual editor (by @louisqli)
- fix: Copy As missing from the right-click menu of a selected formula in the visual editor (by @louisqli)
- fix: copied formula pasting as a block in the visual editor (by @louisqli)
- fix: Ctrl+click on a citation opening its form instead of selecting it in the visual editor (by @louisqli)
- fix: typing [ ] in LaTeX making a toggle item in the visual editor (by @louisqli)
- fix: typing >> in Markdown making a toggle item in the visual editor (by @louisqli)
- fix: \textbf listed after longer commands in LaTeX completion (by @louisqli)
- fix: image width set in \includegraphics ignored in the visual editor (by @louisqli)
- fix: clicking a figure caption selecting the whole figure in the visual editor (by @louisqli)
- fix: pressing on a caption just under a picture resizing the picture (by @louisqli)
- fix: Typst preview losing its scroll and zoom after a pause (by @louisqli)
- fix: preview too narrow after maximizing the window (by @louisqli)
- fix: same zoom showing different page sizes in the two previews (by @louisqli)
- fix: Typst error dots not clearing (by @louisqli)
- fix: dragging across table cells briefly selecting the wrong columns in the visual editor (by @louisqli)
- fix: reference suggestion after @ drawn without its color in the visual editor (by @louisqli)
- fix: bibliography heading drawn as a list bullet in the visual editor (by @louisqli)
- fix: bibliography divider lines missing in the visual editor (by @louisqli)
- fix: full width images narrower than the text in the visual editor (by @louisqli)
- fix: typing in an unclosed environment slow on large files (by @louisqli)
- fix: undo freezing on large files (by @louisqli)
- fix: switching between Source and Visual freezing after edits (by @louisqli)
- fix: typing in a heading slow on large files (by @louisqli)
- fix: visual editor font not changing with the theme (by @louisqli)
- feat: screen readers point to Source mode in the visual editor (by @louisqli)
- fix: Insert menu math not taking the typing (by @louisqli)
- fix: closing a citation panel moving the caret to the first heading (by @louisqli)
- fix: dragging selected text not moving it in the visual editor (by @louisqli)
- fix: middle-click paste inserting the text twice on Linux (by @louisqli)
- fix: Typst inline formulas beside a reference not opening for editing (by @louisqli)
- fix: typing \frac in Typst math saving letters apart (by @louisqli)
- fix: clicking a label in the visual editor not opening its name (by @louisqli)
- fix: links in the visual editor showing as plain text (by @louisqli)
- fix: Down on a selected table cell not leaving the cell (by @louisqli)
- fix: visual editor rows shifting when coming back to a file (by @louisqli)

## [2.0.1] - 2026-11-15

- feat: Spanish interface language (by @nicolobos77)
- fix: Typst preview can be paused (by @louisqli)
- fix: guests see the host's main file and a running compile (by @louisqli)
- fix: visual editor cursor bugs (by @louisqli)
- fix: live mode engines stop when the folder closes (by @louisqli)
- fix: live mode sometimes jumps to the wrong position (by @louisqli)
- fix: improved live mode start up UI (by @louisqli)
- fix: visual editor table consistency (by @louisqli)
- fix: a file that turns unreadable on disk now asks before saving (by @louisqli)
- fix: significantly improved performance and memory usage (by @louisqli)

## [2.0.0] - 2026-11-10

- WARNING: 2.0.0 cannot collaborate with any clients on 1.x
- feat: TikZ and CeTZ editor (by @louisqli)
- feat: vastly expanded visual editor coverage, including support for beamer and niche classes (by @louisqli)
- feat: vastly improved LaTeX live mode with the new teleport engine (by @louisqli)
- feat: custom themes (by @louisqli)
- feat: keybind manager (by @louisqli)
- feat: removed the unsaved file indicator, since Texpile fully autosaves (by @louisqli)
- feat: Agent tab context ring (by @anarghya-das, @louisqli)
- feat: the Agent tab marks where the agent compacted the chat, with its summary (by @anarghya-das)
- fix: various minor UI changes (by @louisqli)

## [1.6.2] - 2026-10-24

- fix: LaTeX error log not parsing (by @louisqli)
- fix: glibc version issue on Linux (by @louisqli)

## [1.6.1] - 2026-10-22

- feat: invert page colors for live mode (by @louisqli)
- feat: absolute theme (by @louisqli)
- fix: intellisense false positive in beamer use theme (by @louisqli)
- fix: minor UI inconsistency (by @louisqli)

## [1.6.0] - 2026-10-21

- feat: IntelliSense for most CTAN packages and classes (by @louisqli)
- feat: edit math macros as LaTeX in the visual editor (by @louisqli)
- feat: wrapped list items line up under their text (by @louisqli)
- feat: visual editor search matches what the page shows (by @louisqli)
- feat: Preferences grouped into collapsible sections (by @louisqli)
- feat: removed the outdated tutorial (by @louisqli)
- fix: " switches to text in a LaTeX equation on any keyboard layout (by @hkarlsen06)
- fix: workspace files show when opening a file from macOS Finder (by @louisqli)
- fix: various smaller bugfixes (by @louisqli)

## [1.5.0] - 2026-10-13

- feat: snippets (by @louisqli)
- feat: optional built-in helpers such as auto fractions (by @louisqli)
- feat: improved math search in equations (Ctrl+Space in a math field) (by @louisqli)
- feat: Contents shows numbers from the last compile (LaTeX) (by @louisqli)
- feat: pinch to zoom in the PDF and preview (by @louisqli)
- fix: refined Brazilian Portuguese translation (by @ale4-dev)
- fix: various smaller bugfixes (by @louisqli)

## [1.4.1] - 2026-10-09

- fix: search bar overlapping (by @louisqli)
- fix: transparent mode lines not showing (by @louisqli)

## [1.4.0] - 2026-10-09

- feat: made interface cleaner (by @louisqli)
- feat: split editor (by @louisqli)
- feat: spell check in German, French, Spanish, Italian, Dutch, Portuguese (Brazil and Portugal) and Polish (by @louisqli)

## [1.3.1] - 2026-10-06

- fix: Shift+arrow selection and Ctrl+Home/End in the visual editor (by @louisqli)
- fix: Typst Universe templates open on Windows again (by @louisqli)
- fix: Typst tables with merged header cells now match the PDF, also after table edits (by @louisqli)
- fix: various smaller bugfixes (by @louisqli)

## [1.3.0] - 2026-10-04

- feat: more git support coverage (by @louisqli)
- feat: version history (by @louisqli)
- feat: push a repo to GitHub (by @louisqli)
- feat: cite papers by doi/name...etc (by @louisqli)
- feat: Typst Universe support for templates (by @louisqli)
- feat: One click Tinymist install (by @louisqli)
- feat: expanded Typst visual editor coverage (by @louisqli)
- feat: Advanced symbol picker (by @louisqli)
- fix: `\overline`, `\sqrt`, `\hat` and similar typed in the visual math editor put the caret inside them instead of after an empty box (by @hkarlsen06)
- feat: shift-enter in a display equation starts a new one of the same kind below it (by @hkarlsen06)
- feat: significantly improved visual math editing experience for LaTeX and Typst (by @louisqli)
- feat: Agent tab in the dock to work with Claude, Codex, Gemini, Copilot, OpenCode or a custom agent on your project (by @louisqli)
- feat: various QOL updates to spelling, grammar, bibliography checks and word count (by @louisqli)
- feat: save the live preview as a PDF, and source folds are remembered (by @louisqli)
- feat: removed the welcome screen, setup asks where each choice matters (by @louisqli)
- fix: various smaller UX/UI enhancements and bugfixes (by @louisqli)

## [1.2.0] - 2026-09-25

- feat: suggestion mode (by @louisqli)
- feat: side by side comments (by @louisqli)
- feat: collaboration tab in preferences (by @louisqli)
- feat: allow switching between distributions (by @louisqli)
- feat: right click an open tab to show right-click menu (by @louisqli)
- feat: control/command-shift-t reopens closed tab (by @louisqli)
- feat: justified text in the visual editor (Knuth-Plass line breaks and hyphenation) (by @louisqli)
- feat: transparent themes available (by @louisqli)
- feat: a welcome screen (by @louisqli)
- feat: Refine rewrites selected text with an AI agent already on your computer (by @louisqli)
- fix: version check before collaborations (by @louisqli)
- fix: up and down arrows keep their column in the visual editor (by @louisqli)
- fix: various visual editor improvements and bug fixes (by @louisqli)
- fix: improved dragging experience for visual editor (by @louisqli)
- fix: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z work when the text is not focused (by @louisqli)
- fix: live preview will not fall back to recompile when typing fast (by @louisqli)
- fix: visual editor now supports synctex jumping (by @louisqli)
- fix: `^` in the visual math editor no longer turns into `\^` on Nordic and German Macs after typing a backslash (by @hkarlsen06)
- fix: `\boxed` and black math in the visual editor are visible in dark themes (by @hkarlsen06)
- fix: various other minor issues (by @louisqli)

## [1.1.0] - 2026-09-10

- fix: Typst completion issues after a `.`
- fix: switching languages now reopens the workspace
- fix: enabled differential updates
- feat: LaTeX and Typst auto-close pairs such as `{}` and `` `' ``
- feat: recompile from scratch and clean auxiliary files for LaTeX
- feat: copying and pasting in the terminal via right-click and keybindings
- feat: the PDF preview refreshes automatically even when the document is compiled externally

## [1.0.2] - 2026-09-09

- fix: 1.0.1 portable build and installed windows build update issue.

## [1.0.1] - 2026-09-08

- feat: Brazilian Portuguese interface language by @ale4-dev
- feat: portable Windows build
- fix: #22
- fix: #23

## [1.0.0] - 2026-09-07

- fix: live mode is no longer marked experimental in the compile
- fix: improve memory usage
- fix: improved editing large documents in visual mode
- fix: fix visual mode displaying no elements on extreme verbatim environments
- fix: improved visual editing cursor handling
- fix: reduced height of pdf preview

## [1.0.0-rc.4] - 2026-09-04

- fix: MCP now give assistant tools to fix issues regarding comments when editing files
- fix: a comment whose surrounding words changed shows a Check placement badge instead of silently sitting on another copy of its sentence
- feat: Ctrl+T (Cmd+T on macOS) opens the file picker, and the palette's file rows show the explorer's icons
- fix: Ctrl+W closes a tab whose file could not be loaded, such as one deleted on disk
- fix: UI freeze in cold start
- fix: improve contrast in all themes

## [1.0.0-rc.3] - 2026-09-03

- fix: various improvements to align with Apple's design guidances on macOS
- fix: various UI improvements
- feat: a lot more theme (check it out at File > Preferences)

## [1.0.0-rc.2] - 2026-09-01

- fix: link not showing on click
- fix: UI inconsistency
- fix: search bar does not auto-focus

## [1.0.0-rc.1] - 2026-09-01

- feat: guest able to join a shared session from the browser (join.texpile.com)
- feat: open a single file (.tex, .typ ...etc)
- fix: various fixes and improvements to LaTeX live preview
- fix: various improvements to the visual editor
- fix: various improvement to .bib editor
- fix: faster startup and various performance optimizations

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
