# Parity fixtures: key outcomes and pointer rules

What the DOM visual editor (v2.0.1, `canvas/p0-dom`, see `environment.domEditorCommit` in every file) does for keys and for the
pointer on Linux, recorded by `perf-drive/parity/keys/` in texpile-tools. The canvas replays them in `keyParity.spec.ts`,
`hitParity.spec.ts` (right click, multi click), `caretParity.spec.ts` (caret blink) and `mathCaretParity.spec.ts` where a start
sits beside math. macOS and Windows rows are in `platforms.json` as pending.

## Environment block

Every `*.json` here starts with `environment`:

| Field | Meaning |
|---|---|
| `folder`, `file` | the parity document: folder under `perf-drive/work/docs/`, file inside it (opened by double click in the tree) |
| `window` | `[innerWidth, innerHeight]` in CSS px, 1280 x 860 |
| `devicePixelRatio`, `zoom` | 1 and 1 (the window is not zoomed) |
| `scroller` | the scrolling element of the visual editor: `client` size, `scrollHeight`, `box` = `[x, y, width, height]` in client px |
| `docSize`, `topLevelBlocks` | `doc.content.size` and `doc.childCount` of the loaded document |
| `texpile`, `chromium`, `electron`, `os`, `platform` | versions of the app and the runtime, the OS and the display (`Xvfb :99`) |
| `domEditorCommit` | `git rev-parse HEAD` of the DOM editor worktree that was served |
| `profile` | `standard`, or `large-doc-plain` when `docSize` is over `LARGE_DOC_NODE_SIZE` (150000): the DOM editor lays such a document out in its plain profile and the canvas does not (design 21.1) |
| `startSet` | `all` starts, or `core` (the 23 starts of `CORE` in `capture.mjs`) for documents that repeat what the first ones cover |
| `scrollPosition` | key files have no single position: before each row the start is scrolled until its caret sits 40% down the scroller. `block` on a start is the index of its top-level block |

## `<folder>.<file>.json`: key outcomes

`/` in a file name becomes `_`. Fields:

- `keys[]`: the rows pressed, in order. `id` names the row, `kind` is `move`, `delete` or `clipboard`, `by` the granularity
  (`character`, `word`, `line`, `paragraph`, `page`, `document`) or the clipboard action, `dir` is -1 (backward, up) or 1,
  `extend` is true for the Shift variant (`id` ends in `+shift`), `key` is the Playwright chord pressed (`page.keyboard.press`,
  Linux: `Control` is Ctrl). The 14 moves each appear with and without Shift (28 rows), then 4 deletions
  (Backspace, Delete, Ctrl+Backspace, Ctrl+Delete), then Shift+Delete (cut), Ctrl+Insert (copy) and Shift+Insert (paste).
  `line-up` and `line-down` are the plain arrows, `line-start` and `line-end` Home and End. Grapheme steps are the
  `character` rows at the `grapheme-*` starts. Clipboard rows run at the `range-*` starts and `word-middle` only; before
  `paste-shift-insert` the clipboard holds `PASTE-PROBE`.
- `starts[]`: `cat` (the kind of start, below), `label` (in words), `sel` = `[type, anchor, head]` the selection the row starts
  from, `ctx` = 12 characters either side of the head with `|` at the head (U+FFFC stands for a non-text leaf), `block` the
  index of the top-level block, `chain` the node type names from the doc to the textblock, `prep` when the start needs the
  document changed first (`{kind: 'emptyParagraph', at}`: an empty paragraph is inserted at `at` before the selection is set;
  positions in that start's rows are in the changed document), `rows`.
- `rows[]`: one array per key, `[keyIndex, type, anchor, head, extra?]`. `keyIndex` indexes `keys`; `type`, `anchor`, `head` are
  the selection after the key, in ProseMirror positions of the pinned document; `type` is `text`, `node`, `gap` (a gap cursor:
  anchor = head = its position), `all` or `cell`. `extra` appears only when it has something to say:
  - `gone`: the text taken out of the document (`\n` between blocks, U+25A1 for a non-text leaf); `kinds`: the node type names
    removed whole; `put`: text put in (paste); `ds`: change of `doc.content.size`
  - `dy`: the scroller's `scrollTop` after minus before, in px (after the scroll settled for page and vertical keys). Scroll of
    other keys moves with layout, so a replay treats it as informative
  - `caret`: only for `line-up`, `line-down` and the page keys: `[before, after]`, each `[x, y, height]` of the caret
    (`coordsAtPos(head)`): x in client px, y in px from the scroller's top, height in px. `[x, y, 0]` is a gap cursor
  - `unstable`: the row is left out of a replay. Two replays that ran on their own disagreed with the record and with each
    other, or a fresh repeat of ten random rows showed them to differ. 2779 of the 10426 rows of the kept starts carry it. The groups:
    every `page-up` and `page-down` row (with and without Shift: the caret and scroll after a page key depend on scroll timing),
    every `line-up+shift` and `line-down+shift` row (the goal column the browser keeps), every row of a `display-start` or
    `display-before` start (the DOM selection set there is not always the one asked for, rows also carry `domUnverified`), the
    `paragraph-up` and `paragraph-down` rows (with Shift) of the display, inline-math-before and heading-start starts, the line
    rows of display starts, the `line-up` and `line-down` rows of p2304, and a few single rows. A start with `unstable` at
    its top level is left out whole: 39 starts, all node selections (a Shift move from a node selection depends on the
    browser's own selection at the press), 1248 rows in all. The page keys are still recorded for reading; their caret and
    scroll rule is replayed from `pointer/` (PageUp and PageDown there), not row by row
  - `notRestored`, `unplaced`: the document did not return to the original, or the start could not be set. Neither occurs in the rows kept.
- `documentRestored`: the document equals the original after the last row.

Start categories: `word-middle`, `word-start`, `word-end`, `textblock-start`, `textblock-end`, `line-start`, `line-end`,
`line-middle` (the first position drawn on the second line of a wrapped paragraph, the last position of the first line before
its break space, the middle of the second line; at a break inside a hyphenated word the two coincide, and the browser decides the
side), `range-word`, `range-blocks` (a selection from one paragraph into the next), `inline-math-before|after|node`,
`chip-before|after|node` (an inline atom that is not math), `display-before|after` (the text positions around a display
formula), `display-start|end` (inside a display formula's text), `display-node`, `display-gap-before|after`,
`list-item-middle|start|end`, `table-cell-middle|start|end`, `heading-middle|start|end`, `raw-block-node|start|end|gap-before`
(a code or raw block), `cjk-middle|start|end`, `grapheme-start|after|end` (combining mark, emoji sequences, flag, Hangul),
`punct-before|after`, `empty-paragraph`, `document-start`, `document-end`. A document without the construct has no such start.

How a row was made: restore the document to the original, set a caret at the document start, set the start selection
(retried until ProseMirror's state and the browser's DOM selection agree), scroll, press the chord, wait two frames, read, then
restore. Setting a caret at the document start first makes a row independent of the row before it: without it Chromium kept the
previous DOM selection and a Shift key extended from the wrong anchor on some rows.

Documents: `keys-sweep` (`sweep.tex`, `sweep.typ`, `sweep.md`) is written for this capture. It adds what the parity documents
lack: CJK text, emoji, combining marks, flags, Hangul, Devanagari, punctuation runs, a display formula, a list, a table and a
code block in each language. Its source is in `perf-drive/parity/keys/README.md`.

`unplacedStarts[]` (when present) lists starts whose caret the DOM editor cannot hold: a text position inside a raw block or
display formula at the start or end of the document, or beside one, where the DOM editor turns the selection into a node
selection or gap cursor. They have no rows because every row from them started from another selection; the same places are
covered by the `raw-block-node`, `display-node` and `display-gap-*` starts.

## `caretwalk.json`

The five tests of `tests/integration/caretWalk.spec.ts`, each with its start and keys. `tests[]`: `id`, `file` (the document, as
the spec writes it, in `perf-drive/parity/keys/caretDocs.mjs`), `spec` (the test title), `start` (`how` and `pos`), `steps[]`
(`key` pressed, then the selection as the spec reads it: `type` as `TextSelection`, `NodeSelection`, `GapCursor`, `parent` the
parent or node type name, `text` the first 14 characters of the parent, `anchor`, `head`), `typed` where the spec types
(`docChange` = `{at, gone, put, ds}` against the original and `onDisk`: the saved file matches the spec's regex), `gapCaretColors`
(the computed caret color of the gap bar and its neighbors), `nodeBeforeHead`, `specExpects` (what the spec asserts per step as
`type:parent`), `matchesSpec`, `attempts` (3, restored in between) and `stableAcrossAttempts`. All five match the spec. Their
first run after a document opens can differ: `words-appendix-up` ended on a text caret inside the `\appendix` chip when pressed
within about 1.5 s of the open, before the drawn chip was rendered. The recorded run waits 3 s.

## `pointer/`

One file per document and set of rules; `pointer-docs` is the folder of small purpose-made documents. In every case a position
is a ProseMirror position of the loaded document and a click point is given as `{pos, to, dx, dy, hit}`: the point is
`coordsAtPos(pos)` (the midpoint of the glyph box between `pos` and `to`, or the center of the node's element for a non-text
node at `pos`) moved by `dx, dy` px, in client coordinates after scrolling `pos` to 40% of the scroller; `hit` is the element
`elementFromPoint` finds there. A canvas replay scrolls the same way and uses `clientPointOf(pos)`.

- `contextClick[]` (right click): `id`, `before` and `after` as `[type, anchor, head]`, `click`, `selected` (text of the selection,
  40 characters), `menu` (visible menu or popover classes after the click, empty: the app's own menu is not a DOM role=menu).
- `clicks[]` (left click sequences): `id`, `clicks` (1, 2 or 3 presses 40 ms apart with `clickCount` set), `mods` (`Shift`,
  `Control` held), `before`, `click`, `after`, `selected` (the ProseMirror selection's text), `domSelected` (`getSelection()`).
  A press within 500 ms and 4 px of the last upgrades to a double and a triple click in prosemirror-view itself.
- `edgeLines` (`edge.tex`, `edge-two.tex`): the first and last line of a document of one or two paragraphs. `cases[]` hold
  `id` (where the caret starts), `key` (`ArrowUp`, `ArrowDown`, with Shift, and a key pressed twice, written `ArrowUp ArrowUp`),
  `before`, `after`, `firstBlock`, `lastBlock`.
- `pageKeys` (`pointer-tall.tex` and the theorems paper): `cases[]` with `start` (a start category), `key` (`PageDown`, `PageUp`,
  `PageDown PageDown`, `Shift+PageDown`), `scrollerHeight`, `before`, `after`, `scrollDy` (px the scroller moved), `caretDocDy`
  (px the caret moved on the page: pane y after plus scroll after, minus the same before), `caretPane` (pane y before and
  after), `caretStepOverHeight` (`caretDocDy` over `scrollerHeight`).
- `autoscroll` (`plain-tall.tex`): the pointer is pressed in the text 60 px above the pane's bottom edge (or 90 px below its
  top edge), moved out in six steps of 20 ms to `pastPx` px beyond the edge (`pointer` = the final client point, `pressAt`
  the press point) and held still for 2.2 s. `samples` are `[ms, scrollTop]` polled every 40 ms from outside the page (a
  frame loop inside the page made the DOM editor's scroll stall), `pxPerSecond` the speed between the first and last sample
  that moved away from either end of the document, `pxPerFrame60` that over 60, `firstMoveAtMs` the delay before the first
  movement, `selection` the selection at the end.
- `blink` (`plain-tall.tex`): a 6 x 21 px screenshot clip around the caret, `sampleCount` samples over 3.2 s after a 1.2 s rest
  (`sampleGapMs` apart), `samples` `[ms, dark pixels]`, `periods` the lengths of the runs of caret visible (`on`) and hidden,
  `onMs` and `offMs` their means without the first run.

## `platforms.json`

`linux.rules` holds the values of `PLATFORM_RULES` read from the files above, each with the case it came from. `windows` and
`mac` hold every row of design 10.3 as `status: pending` with the chord of the table and, where Chromium documents one, its
default (`chromiumDefault`, from Chromium's editing behavior, not yet measured on that OS), and the five rules with
`value: null`. The same scripts record them on Louis's machines.

## What could not be recorded

- Windows and macOS rows (no such machine here).
- The hit grid, caret rects and line breaks belong to the geometry fixtures, not this folder.
- Input method and dead-key sequences (Xvfb has no input method). Ctrl+Insert and Shift+Insert reach the page, Shift+Delete
  cuts; the real clipboard of the window is not read back, only the document change.
- Page key scroll is smooth: `dy` is read after the scroller has held still for 8 frames, so a canvas that scrolls instantly
  compares by the final value.

## Flaky pointer cases

A pointer case with `flaky` was answered two ways by the DOM editor in repeated runs. `flaky.after` (and `flaky.selected`) holds
the other outcome and a replay accepts either. They are: ArrowUp on the first line mid-line and near its end in `edge.tex` and
`edge-two.tex` (the caret goes to the start of the block or stays), and the right click on inline math with nothing selected in
`pointer.typ` and the theorems file (a node selection of the math or a caret before it). The autoscroll and blink numbers vary
by a few percent between runs (`pxPerSecond` 1870 against 1874 in one pair) and are compared within 10 percent.

## Repeat check

Two outcomes of a vertical or page key agree when the selections and text changes are equal and `dy` and every `caret` number
are within 12 px: the scroll after a key settles to a slightly different offset from run to run (a canvas replay uses the same 12 px).

`stabilize.mjs` replayed every row of every file on its own: a replay that agrees with the record keeps it, two replays that
agree with each other replace it, otherwise the row is `unstable`. Two causes of flaky rows were fixed in the page driver
first (focus left in a CodeMirror island by a code block start, and a selection accepted inside another block's island), so
no row is marked soft any more. `verify.mjs` replays ten random rows per file from rows and starts that are not `unstable`,
trying each up to three times because a replay that lands while the machine is busy can miss the key. A row that still
differed was replayed five times on its own (`retryRows.mjs`) and re-recorded. Seeds 301 to 309 over every file were run in turn, each followed by re-recording of the rows that differed; the last seed ends with no
differing row.

The last repeat (seeds 601 and 602 over the 18 files of the parity documents, ten rows each) found no differing row among rows that are not `unstable`.
A key the editor missed records as no change, so every row whose selection stayed at the start was replayed five more times (`recheck.mjs`). Rows where four of five replays agreed on another outcome were replaced (46 rows, mostly Shift+word at a textblock start, paragraph keys and gap cursors). The final repeat (seed 9003, 25 rows per file over all 18 files, 450 rows) found no differing row.

## The supplement documents

Ten more key files and two more pointer and walk files cover the documents the coverage audit added (`parity-tex-beamer`,
`parity-tex-body`, `parity-tex-classes`, `parity-tex-apa`, `parity-typ-body`, `parity-md-body`). Their format is the one above, with
these additions. Everything was recorded on Linux against the DOM build with the capture hook (`environment.domEditorCommit`).

Files: `parity-tex-beamer.main.tex` (every start of the survey), `parity-tex-body.main.tex`, `parity-typ-body.main.typ`,
`parity-md-body.main.md`, `parity-tex-apa.main.tex` and `parity-tex-classes.{ieee,report,memoir,llncs,elsarticle}.tex` (core
starts, `startSet: core`, plus the `x-*` starts). The other fourteen class files are not recorded (about a second a row each on
documents that hold a title block and a few paragraphs).

### Extra key rows

`keys[]` has 37 entries. The first 35 are the rows of design 10.3. Two are added at the end, `enter` (Enter) and `tab` (Tab), kind
`edit`. They are pressed only from the `x-*` starts (the frame, block, caption and chip starts below), so a file lists them only in
those starts. The Beamer gaps asked for are rows of this table at the starts below:

| Gap | Start | Row |
|---|---|---|
| Enter and Tab in a frame title, a block title | `x-frame-title-*`, `x-block-title-*` | `enter`, `tab` |
| Backspace and Delete in an empty frame title, an empty block title | `x-frame-title-empty`, `x-block-title-empty` | `delete-char-back`, `delete-char-forward` |
| deletion across a frame edge | `range-frame-edge` (end of a frame into the next title) | `delete-char-back`, `delete-char-forward`, `delete-word-*` |
| copy, cut, paste inside a frame | `range-frame-word`, `range-frame-title-body`, `frame-node` | `cut-shift-delete`, `copy-ctrl-insert`, `paste-shift-insert` |
| Left and Right into and out of a frame | `x-frame-body-start`, `x-frame-body-end`, `x-frame-title-start`, `frame-gap-*` | `char-left`, `char-right` and the Shift variants |

### Added starts

| Start | Meaning |
|---|---|
| `x-<name>-middle`, `-start`, `-end` | a caret in the middle, at the start and at the end of the middle textblock that matches `<name>`: `frame-title`, `frame-subtitle`, `column`, `block-title`, `block-body`, `table-notes`, `figure-caption`, `float-caption`, `table-caption`, `blockquote`, `term-title`, `term-body`, `typ-env`, `typ-grid-cell`, `typ-figure-caption`, `theorem` (a paragraph of an environment outside a frame), `abstract`. A document without the construct has no such start |
| `frame-node`, `frame-gap-before`, `frame-gap-after` | a frame as a node selection, and the gap cursors before and after it |
| `x-frame-body-start`, `x-frame-body-end` | the first paragraph under a frame title and the last paragraph of a frame |
| `range-frame-title-body`, `range-frame-word`, `range-frame-edge` | from inside a frame title into its first paragraph, a word of a frame paragraph, and from the end of a frame into the title of the next one. Clipboard rows run at all three |
| `x-frame-title-empty`, `x-block-title-empty` | the caret at the start of a title whose text was deleted first: `prep` is `{kind: 'clearText', from, to}` and positions in that start's rows are in the changed document |
| `x-titlepage-node`, `x-titlepage-gap-before` | the `\titlepage` line selected and a gap cursor before it. A caret inside it cannot be held (`x-titlepage-start` and `-end` are in `unplacedStarts`) |
| `x-pause-chip-*`, `x-footnote-chip-*`, `x-alert-chip-*` | `-before`, `-after` and `-node`: a caret beside the inline latex chip with that text, and the chip selected |

`unplacedStarts` also lists, in these files, `document-start` and `raw-block-start` where the document begins with a raw block
(`\documentclass` and the title lines are drawn chips), and `punct-before|after` where the only matching text sits inside a code
block. The deck's chains are in `chain` as the survey writes them (`frame_title>frame`, `paragraph>column>columns>frame`).

### `caretwalk-deck.json`

The second deck walk, on `parity-tex-beamer` main.tex. `walks[]`: `id`, `desc`, `start` (`text`, `nodeType`, `at`: `start` or `end` of
the first textblock of that node type whose text starts with `text`; `pos` and `selection` where it landed), `steps[]` (`key`, then
`type`, `parent` (node type), `text` (first 14 characters of the parent), `chain` (ancestors, innermost first), `anchor`, `head`),
`restored`, `attempts` (3) and `stableAcrossAttempts` (true for all ten). The keys are `ArrowLeft`, `ArrowRight`, `Home` and `End`:
from a frame title through its subtitle and body, out of a frame in both directions, through two and three columns, the column
environment forms, a block title and body and an empty block title. Right at the end of a title moves to the start of the
subtitle (`+2`: the node boundary costs two positions), Left from the start of a block body goes to the end of its title, and Left
from the start of a frame title goes into the previous frame.

### `pointer/pointer-docs.chrome-deck.tex.json`, `pointer/pointer-docs.chrome-body.tex.json`

Clicks on the chrome of nodes and right clicks on them, in two small documents built from the Beamer and body parity documents
(`pointerDocs.mjs` writes `chrome-deck.tex` and `chrome-body.tex` into `pointer-docs`). Every case starts from a caret in the first
textblock. `cases[]`:

- left click on a control: `id`, `node` = `[pos, type]` of the node the control sits in, `nodeBox` = `[width, height]` of the node's
  element, `control` = `[x, y, w, h]` of the control from the node's top left (client px, after the node was scrolled to 30% of the
  pane; `x` can exceed the width where the control sits in the gutter, as the table and picture gear do), `controlText` and
  `controlLabel`, `needsHover` (the pointer is moved over the node first, 350 ms), `opacityAtClick` (the controls fade in on hover),
  `hit` (element under the click), `before` and `after` as `[type, anchor, head]`, `docChange` (what the click edited, the
  Add title and Add subtitle buttons insert a title, 2 positions) and `popovers[]` (`cls`, `items` = the button labels, `text`, `box`
  after the click). The frame gear opens the frame settings; the column width chip opens a LaTeX field panel with the width; the
  table, table float and picture gears open their settings. The table inside a frame shows no gear (`missing`: the block handle
  shows for top level blocks only).
- right click: `id`, `node`, `nodeBox`, `click` = `[fx, fy]` as fractions of the node's box, `hit`, `before`, `after`, `selected`,
  `menu` (empty: the app's menu is its own popover) and `popovers[]` with `items`: Copy, Paste, Paste Without Formatting,
  Refine with an Agent, Comment, Insert Citation from Zotero and the items of the node (the table has more). A right click moves the
  caret into the clicked block as a left click would. A canvas replay places the click at `nodeRect + [fx * w, fy * h]`.

Two repeats of both files gave the same `after`, `docChange`, `control`, `hit` and menu items in all 20 cases. The body document is
shorter than the pane, so its environment has no scroller (`scroller: null`).

### Stability of the supplement files

`stabilize.mjs` replayed every row (a mismatch was replayed twice more and a replay pair that agreed replaced the record) and
`recheck.mjs` replayed the rows whose selection stayed at the start five times (four agreeing replays that differ from the record
replace it: 11 rows in the deck, 4 in the body, 13 in the Typst body, 7 in the Markdown body, 3 in ieee). A row is `unstable` when
its start could not be held by the browser's selection (`domUnverified` or `unplaced` on the row) or when replays disagreed. Share of
rows left out of a replay, per file:

| File | Rows | Unstable | Share | Group and cause |
|---|---|---|---|---|
| parity-tex-beamer.main.tex | 2225 | 26 | 1.2% | page and vertical rows (`pageStabilize.mjs`, see below) |
| parity-tex-body.main.tex | 1360 | 51 | 3.8% | every row of the `display-before` start (the caret at the end of the paragraph above a display formula is not always the one asked for, the same group as in the first documents), plus page and vertical rows that scroll or not depending on where the page was left |
| parity-typ-body.main.typ | 1264 | 29 | 2.3% | page and vertical rows, a few single rows |
| parity-md-body.main.md | 550 | 20 | 3.6% | `line-start+shift` and `line-end+shift` at `display-gap-after` (the goal column a Shift line move keeps), page and vertical rows, a few `paragraph` rows at `display-before` |
| parity-tex-apa.main.tex | 128 | 3 | 2.3% | page rows |
| parity-tex-classes report, memoir, llncs, elsarticle | 128, 160, 128, 332 | 0, 3, 0, 0 | 1.9% at most | memoir: `line-end+shift` and `word-right` at `document-start` (a key at the document start answers differently depending on the row replayed before it) |
| parity-tex-classes.ieee.tex | 396 | 332 (264 rows carry `unstable`, 68 more sit in a start marked `unstable`) | 83.8% | every start but `raw-block-node` and `raw-block-start`: the title and author lines are one drawn block and a caret near it, in the abstract and keywords after it or at either end of the document, is not held by the browser (`domUnverified` rows; replays land on the document start or end). The two kept starts are the drawn block selected and a caret at its start |

Every `+shift` row of a start whose selection is a node (the `*-node` starts) is also `unstable`: 326 rows over the ten files,
not counted in the table above. It is the group the first documents leave out whole, because a Shift move from a node selection
depends on the browser's own selection at the press. A fresh repeat found one in the deck (`x-titlepage-node`, `line-end+shift`)
whose outcome followed the row replayed before it.

Page and vertical rows (PageUp, PageDown, ArrowUp, ArrowDown, with and without Shift) depend on how far the window had scrolled before the
key: the same row scrolls by a page in one replay and stays put in the next. The first repeat after the stabilize pass (seed 9101) found
such rows unmarked in the Typst and tex bodies, so `pageStabilize.mjs <port> <fixture> [tries]` replays every page and vertical row in
shuffled order (four tries) and marks a row `unstable` when a replay disagrees with the record. Rows that still differed in later repeats
were marked by `verify.mjs` run with `MARK=1` (three tries per row, 300 rows per file). Repeats not counting the marking runs: seed 9301
found one vertical row in tex-body (marked), seeds 9401 and 9402 found three rows in md-body and memoir (marked); the final repeat
(seeds 9801 and 7777, 25 rows over all ten files, 250 rows each; seed 7777 first found a memoir row at `document-start`, which was marked) found no differing row among rows that are not `unstable`, and so did seeds 8001 earlier
and 9503 (100 rows in tex-body).
