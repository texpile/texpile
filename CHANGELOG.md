# Changelog

Release notes for Texpile Desktop. Add notes under `## [Unreleased]` as you work; run
`pnpm --filter texpile-editor release <patch|minor|major>` to cut a dated, numbered release.

## [Unreleased]

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
