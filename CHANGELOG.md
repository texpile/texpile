# Changelog

Release notes for Texpile Desktop. Add notes under `## [Unreleased]` as you work; run
`pnpm --filter texpile-editor release <patch|minor|major>` to cut a dated, numbered release.

## [Unreleased]

- change: Source Control uses VS Code's own strings throughout (Commit, Graph, Checkout to…, Publish Branch, Commit & Sync, Stage Changes, Discard Changes on untracked files, (Current Change) / (Incoming Change), N Conflicts Remaining, Manage Unsafe Repositories), and git's wording where VS Code has no equivalent; conflicts are called conflicts everywhere, and Texpile's own commit messages follow git (WIP before sync)
- change: list rows (file explorer, Source Control, Graph, Contents, Problems, Local History, Preferences, the start screen) hover in the same light gray as menus and buttons, instead of a darker one
- feat: Local History keeps a copy of each file as you save (as in VS Code), in projects without git too. It opens from File › Local History… and a file's or tab's right-click menu, showing a file's copies by day, beside the file with what changed since, with Restore This Copy, Copy and Save a Copy Now…; a copy's … menu renames or deletes it; File › Restore Deleted File… and a folder's right-click menu bring back a deleted file
- feat: Local History is kept for writing with autosave: saves gather into one copy for up to 5 minutes, copies are kept 7 days and then one a day for 30, named copies and each file's newest stay, files up to 1 MB, 300 MB in all
- feat: a copy is kept before a discard, a restore, or a reload over unsaved edits, and discard and restore offer Undo; in a shared session the host keeps guests' edits too
- feat: the portable build files a project on its own drive by its path from the drive's root, so Local History follows the drive to another computer and the Texpile folder can move on it
- fix: Escape closes a menu open over a dialog, not the dialog too
- feat: Preferences has a Version Control tab: Git (Autofetch, and the Git Identity commits carry) and Local History (Keep local history, and Saved copies, which shows their size and opens to Clear Local History…)
- change: comparisons no longer draw a colored bar down the left of changed lines
- change: Source Control explains less and lets the buttons speak: the Publish Branch dialog has no intro, sign-in prompts no longer describe how the answer is kept, confirmations drop the extra paragraph, and a folder inside another repository or owned by another account says so in one line, with the rest in the buttons' tooltips
- fix: rows in Graph and the changes list use the panel's full width: the "…" button takes room only while you hover the row, and in Graph a commit's message keeps its room before the author and time
- change: a folder without a Git repository says so in one line instead of two paragraphs, and offers Initialize Repository; publishing comes after a first commit, from the panel's main button
- change: in English, anything you click that names a command is in Title Case, as in VS Code and macOS: menu items, start screen items, command palette commands, buttons, tabs, dialog titles and section headings (Open Folder, Complete Merge, Abort Merge). Messages, tooltips, placeholders and setting labels stay in sentence case
- fix: Merge from the comparison view opens the file where Accept Current Change, Accept Incoming Change and Accept Both Changes are, instead of showing the conflicts as changes to revert; a merge commit's message no longer carries git's "# Conflicts" comment
- change: menus, dialogs and notices in source control look and behave alike: icons in every menu, destructive items last in red, confirmations that put the consequence under the question, git's own words behind Show Command Output, file icons in the changes list, and a loading state instead of "No commits yet" while Graph loads
- fix: the default Cancel and OK of a confirmation were English in every language; Escape that closes a menu, dialog or confirmation no longer also leaves Source Control; "Fetch" offers Sync, as Autofetch does
- fix: your GitHub sign-in answers only github.com's questions; a question from any other server can never be answered with it
- fix: a file with [ ] in its name is only ever that file: discarding, saving or restoring it no longer touches a file whose name it resembles
- fix: Restore will not replace an untracked file, and names it; files with quotes or a backslash in their names are restored and compared correctly
- fix: a branch deleted on the remote (a merged pull request's) is seen as gone: Sync no longer fails on it or publishes it again, and Publish Branch is offered instead
- fix: a clone whose files could not be written (a failed Git LFS download, a name the system refuses) says so instead of opening a project where every file reads as deleted
- fix: an SSH key the server refused, or a server whose key changed, is said as such instead of advice about passwords and tokens
- fix: in a project that is one folder of a larger repository, Commit no longer unstages what was staged outside it; a failing hook is reported in its own words instead of "Git is not installed"
- fix: Merge opens a text file with conflicts to resolve rather than a figure; Keep Our Version or Keep Their Version, and deleting a folder, drop the open file's unsaved edit so it cannot land on the result
- fix: Commit & Sync includes new build output git says is in the way; opening another folder during a Sync no longer shows the old folder's changes
- feat: on Linux without a keyring, a sign-in that worked is remembered until you quit Texpile (never written to disk) instead of being asked for on every Sync
- fix: a repository in a folder above the project colours nothing, counts nothing and marks nothing until you choose to use it, as in VS Code
- fix: a stray `<<<<<<<`, `=======` or `>>>>>>>` line keeps a file from counting as resolved, as in VS Code, and is highlighted where it is; a file being merged shows no change marks in the margin
- fix: a repository locked by another git is retried up to ten times, for every change Texpile makes, as VS Code does; Restore no longer drops a file when the lock outlasts that
- fix: the Source Control progress bar appears at once and stays a moment after git finishes, so steps run back to back read as one
- feat: while merging, a file one side deleted or a figure both sides changed asks which side to keep (Keep Our Version, Keep Their Version, Delete File), and Complete Merge waits for the answer
- feat: Texpile fetches every three minutes while in front (Autofetch) and says when new commits arrive, without ever asking for a sign-in; Preferences › Version Control turns it off
- fix: Commit keeps a rename whole, takes in a file whose conflicts are all resolved after a stash, and waits while a conflict is still marked
- fix: Discard puts back changes staged in a terminal; a file staged as new, or the new name of a rename, goes to the Trash; where there is no Trash it asks before deleting outright
- fix: a repository inside the project is left out of the changes list, and a folder row that also holds ignored files is never deleted whole
- fix: a clone whose submodule cannot be fetched opens, and says what is missing, instead of reporting nothing at the address
- fix: Publish Branch before a first commit says so instead of creating an empty GitHub repository
- fix: an SSH key refused no longer signs you out of GitHub, and the palette shows who is signed in now
- feat: sign in to GitHub in the browser with a one-time code (VS Code's device flow); the account answers git for Sync and Publish Branch, and Sign Out of GitHub ends it.
- feat: a progress bar runs across Source Control while git works
- feat: comparisons have previous and next change buttons (Alt+F5 and Shift+Alt+F5 in the source comparison) and Revert Change beside each change
- feat: a file both sides changed can be kept whole from its menu, Keep Our Version or Keep Their Version, for figures, PDFs and files one side deleted
- feat: folders with changes inside are tinted and dotted in the file tree; a file still being merged shows a !, and deleted files are struck through in Source Control
- feat: Fetch in the command palette fetches without pulling anything in; Sync blocked by uncommitted changes offers Commit & Sync
- feat: Ctrl+Shift+G (⌃⇧G on macOS) and Show Source Control in the palette open the panel with the keyboard in the message box
- feat: an Open Changes button in the editor's top bar while the open file has changes
- fix: the branch name says HEAD detached at … after checking out an earlier commit, instead of "HEAD"
- fix: a repository in a folder another account owns (a USB or network drive) is no longer called "not a repository"; Source Control explains it and offers Manage Unsafe Repositories
- feat: a folder of 200 or more untracked files is one row with its count and Add to .gitignore; past 2,000 changes the list stops and says so
- feat: GitHub's push protection and protected branches are explained in plain words, with the file and line push protection found
- feat: failed commits, syncs and publishes say what to do next, with git's own output behind Show Command Output; Commit, Sync and Publish Branch say Committing Changes…, Synchronizing Changes… and Publishing Branch… while they work
- fix: an edit waiting for autosave in a file that was not changed on disk yet is included in the commit being made
- feat: clicking a change mark in the source editor's margin shows what those lines were in the last commit, with Revert Change
- feat: Publish Branch sends a project to a new GitHub repository, a remote it already has, or any repository by URL
- feat: Sync pulls commits made elsewhere and pushes yours, and undoes the attempt rather than leave a conflict behind; git writes the merge commit's message, as under VS Code
- feat: git's sign-in questions (a password or token, an SSH key's passphrase, a server it has not seen) are asked in the window instead of failing
- feat: the first commit on a computer asks for the name and email git records (user.name and user.email), once
- feat: checking out a branch over changes that would be overwritten offers to commit them first, then check it out (Commit & Checkout)
- feat: the Source Control icon counts changed files, Sync is named in words at the top of the panel with the counts each way, and with nothing to commit the panel offers Sync Changes or Publish Branch as its main button
- feat: merging highlights the words that differ between the current and incoming changes, goes from one conflict to the next, accepts one side everywhere at once (Accept All), and marks the file's tab
- feat: without a credential helper, sign-ins that worked are kept in the system keychain instead of being asked for on every push; Forget Saved Git Credentials removes them
- feat: a push GitHub refuses because the repository is someone else's says to ask the owner to add you as a collaborator
- feat: the source editor marks lines added, changed or removed since the last commit in its margin, in the file list's colors; Alt+F5 and Shift+Alt+F5 go to the next and previous change
- feat: Checkout to… in the command palette goes back to another local branch; Source Control shows the branch name as a label, and Texpile does not create or delete branches, which it could not merge back
- feat: Clone Repository, on the start screen and in the File menu, takes a repository's page, clone URL or `git clone` command, shows its progress, and opens the folder
- feat: Open Commit, in a Graph row's menu, lists what that commit changed and each file's difference from its parent
- fix: a folder inside a larger repository asks before committing to that repository
- feat: when Sync finds both sides changed the same lines, Merge marks each conflict in the file with Accept Current Change, Accept Incoming Change and Accept Both Changes, and Complete Merge commits the result (Abort Merge puts everything back)
- fix: pushing uses the credential helpers and settings in your global git config
- fix: committing while git's index was briefly locked could record every unstaged file as deleted
- fix: a new repository starts on `main`, as GitHub does, unless git is configured with another default
- fix: files you unstage in Source Control stay unstaged when you switch the sidebar away and back, after a commit, and after Texpile restarts
- fix: an unfinished merge, rebase or cherry-pick is shown, its conflicted files are kept out of the next commit, and Commit, Restore and Sync wait for it
- fix: restoring an old commit brings back a file renamed since, instead of losing it
- fix: without git installed, Source Control says so and can check again instead of offering a button that fails
- fix: commits, fetches and checkouts made in the terminal show up in Source Control without a refresh
- fix: `\overline`, `\sqrt`, `\hat` and similar typed in the visual math editor put the caret inside them instead of after an empty box (by @hkarlsen06)
- feat: shift-enter in a display equation starts a new one of the same kind below it (by @hkarlsen06)
- fix: opening a recent folder that was moved or deleted says so and offers to remove it from the list, instead of doing nothing or showing an empty workspace (by @louisqli)
- feat: cite a paper by its DOI or arXiv ID: paste it, check the work it names, and Texpile adds a clean BibTeX entry to your bibliography and cites it (right-click menu or Ctrl+K) (by @louisqli)
- fix: guests in a shared session can no longer read or write the project's `.git` folder or its hidden files such as `.env` (by @louisqli)
- feat: find a paper to cite by typing its title (add an author's surname or the year for a common one), or cite a book by its ISBN or a PubMed record by its ID, in the same dialog as DOIs (by @louisqli)
- feat: replace across all files from the search panel: preview each change, replace everything or one file at a time, and undo the whole replace in one step (by @louisqli)
- feat: renaming a label (its chip, or a figure, table or equation's settings), or a citation key in the bibliography editor, also updates its uses in the other files of the same paper (for a key, every paper whose bibliography is that file), and undo in the editor takes them all back (by @louisqli)
- feat: spelling and grammar follow the English you pick (American, British, Australian, Canadian or Indian; the system's by default), any grammar rule can be turned off from its suggestion, and the rules that mostly misfire on papers (LaTeX spacing and dashes, field terms, house style) start off; all of it, the custom dictionary included, is in Preferences' new Spelling tab (by @louisqli)
- feat: the bibliography editor warns when two entries are the same paper (the same DOI or arXiv number under two keys), and notes the entries no document in the folder cites (by @louisqli)
- feat: click the word count for the whole document's words, from the main file through every file it includes: body text, headings, captions, footnotes and tables apart, and per file (by @louisqli)
- feat: LaTeX references are checked as you type, before any compile: a label defined twice, a citation no bibliography entry has, and an image, \input, \include or bibliography file that is not in the project, underlined in the source editor and marked on the visual editor's label and include chips (by @louisqli)
- fix: icons beside their labels in menus, the command palette and buttons sit level with the words on every row, where some rows' icons sat a pixel or two low (by @louisqli)
- fix: Insert Citation by Title or DOI and Insert Citation from Zotero stay in the menu before a folder has a main file; choosing one says to set the main file first, with a button that opens the picker and then carries on with the citation (by @louisqli)
- fix: replace across files keeps a comment on the words it rewrites in a file that is not open, and in suggestion mode makes those changes suggestions, as it does in the open file; undo puts both back (by @louisqli)
- fix: the visual editor shows one loading bar while it renders a file, not two (by @louisqli)
- fix: comment cards a narrow editor pane cuts off fade out at its edge, rather than stopping in a hard line mid-word (by @louisqli)
- fix: icons in Source Control, Local History, the comparison and conflict bars, the editor's read-only, deleted-file and managed-file notices, the explorer's Contents and dialog titles sit level with their words, where the words sat about 2px high (by @louisqli)
- fix: Source Control fits a narrow sidebar: Complete and Abort Merge, the repository buttons, Sync, Publish and the Texpile badge stay inside it, where they ran past its edge (by @louisqli)
- fix: Source Control's messages (Git not found, no repository, nothing to commit…) are readable in a narrow sidebar, with less padding and a size smaller there, instead of a column one or two words wide (by @louisqli)
- fix: the link on Git not found reads How to install Git: it opens the install guide, and Texpile downloads nothing (by @louisqli)
- change: a merge in progress shows Complete Merge where Commit stands, grayed out until every conflict is resolved, with Abort Merge under it and both in the command palette, instead of a yellow box above the changes (by @louisqli)
- change: Source Control uses color only where the rest of Texpile does: a merge, rebase, cherry-pick or revert in progress shows as (Rebasing) and the like beside the branch, the way to finish it in the tooltip, where an orange sentence stood, and Sync and Publish step aside meanwhile; Resolved, conflict notes, the too-many-changes note and the Texpile badge are gray, and the unsafe repository's icon is faint like the others' (by @louisqli)
- fix: Source Control's header fits a narrow sidebar in every language: Sync and Publish drop their word where it would leave the branch no name (in German that was even at the usual width), and (Merging), (Rebasing) and the like give way before Refresh does (by @louisqli)
- fix: the word count in the top bar is the number its details give: a citation's leftover comma or a reference is no word, and the source view counts a LaTeX or Typst file's prose, not its markup (by @louisqli)
- fix: renaming a label in the visual editor keeps each reference's \ref command in the file, and a label chip that starts a paragraph keeps the line break after it (by @louisqli)
- fix: the Contents outline leaves out what TeX skips: headings and included files inside \iffalse or a comment environment (by @louisqli)
- fix: text in the visual editor no longer flickers when the comment margin opens or a font finishes loading (by @louisqli)
- feat: reopening a folder brings back its comparison tabs along with its files, and lands on the comparison if one was open (by @louisqli)
- change: Preferences' Zotero and online citation notes are shorter and say to right-click in a LaTeX or Typst file; the Zotero one links to its setup guide (by @louisqli)

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
