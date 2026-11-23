# MathLive caret outcomes

What today's live `<math-field>` does in the DOM editor, for 52 formulas of the parity documents (40 from the first documents, 12 added from parity-tex-body, parity-tex-beamer, parity-typ-body and parity-md-body). The canvas branch replays it in `mathCaretParity` (design 13.10, W8): the same keys and clicks on the canvas session, offsets compared exactly, caret rects within 1 px.

One JSON file per formula, named `<id>.json`. Recorded by `perf-drive/parity/math/` in texpile-tools (`run.sh`), against the DOM editor commit in each file's `environment.domEditorCommit`, MathLive 0.110.0.

## Units and origins

| Quantity | Meaning |
|---|---|
| px | CSS pixels at devicePixelRatio 1, zoom 1, window 1280x860 |
| offset | MathLive's model offset: the field's `position` (0 is before the first atom, `lastOffset` after the last) |
| client coordinates | the page's viewport (what `getBoundingClientRect` returns); the scroll position is in `formula` |
| live box | `math-field.getBoundingClientRect()` after the field is live and focused: the origin of every caret rect and grid point |
| static box | the formula's `.math-static-placeholder` rect before any entry |
| content box | the field's `.ML__content` rect: where the formula is drawn |

Rects are `[x, y, width, height]` or `[x, y, height]`, rounded to 0.01 px.

The live field is not the static formula (design 13.4). It adds a 1 px border, MathLive's container padding and content padding, so its live box is larger than the static box: an inline formula grows 2 px in each direction (`th-inline-leftright`: 84.64 x 28 static, 86.64 x 30 live) and a display formula 14 px (`md-display-pmatrix`: 202.53 x 38.72 static, 216.55 x 52.72 live). Two offsets relate the boxes:

- `contentDelta`: the content box's top-left minus the live box's top-left (the origin shift from a recorded point to the content box).
- `contentInStatic`: the content box's top-left minus the static box's top-left.

A recorded caret `(x, y)` (live box relative) is at `(x - contentDelta[0], y - contentDelta[1])` from the content box's top-left, and at `(x - contentDelta[0] + contentInStatic[0], y - contentDelta[1] + contentInStatic[1])` from the static box's top-left. The content box of a display formula is still 4 px wider and taller than the static box because of MathLive's content padding (`2px 3px 2px 1px`), which the canvas does not draw (design 13.4), so a display replay compares within that tolerance on x and y; offsets and selections compare exactly.

## Per-file fields

| Field | Meaning |
|---|---|
| `id` | the formula id, also the file name; its prefix names the document (`th` theorems, `tb` tables, `md` feature-sweep.md, `ty` Typst, `pp` p2304, `s1` s148, `bd` parity-tex-body, `bm` parity-tex-beamer, `tb-typ` parity-typ-body, `mb` parity-md-body) |
| `formula.document` | folder and file under `perf-drive/work/docs/` |
| `formula.pos` | the formula node's ProseMirror position in the visual editor's document |
| `formula.type`, `formula.environment` | `inline_math` or `block_math`; the block's environment (`align`, `multline`, or empty) |
| `formula.source` | the node's text exactly as the field gets it (LaTeX for `.tex` and `.md`, Typst for `.typ`) |
| `formula.blockIndex` | index of the top-level block that holds the formula (the scroll position index) |
| `formula.scrollTop`, `scrollerBox` | the pane's scroll offset and client rect when the formula was revealed: its top 35% down the pane |
| `formula.staticBox` | the static box, client coordinates |
| `liveBoxes` | `live`, `container` and `content` rects (client coordinates) once the field was entered by arrow |
| `contentDelta`, `contentInStatic` | content box top-left minus live box top-left, and minus static box top-left |
| `lastOffset` | the highest offset (`mathfield.lastOffset`) |
| `clickEntry` | one click from outside onto an unentered formula: the pointer moved onto the static box center, then pressed. `at` is the point relative to the static box top-left, `state` the outcome (the field is built and focused at that point) |
| `entries` | entering with the arrow key from the paragraph or gap cursor beside the formula: `arrowFromBefore` (a Right or Down) lands at offset 0 and `arrowFromAfter` (a Left or Up) at `lastOffset`. `key` is the key that worked. Where no arrow from the caret before the formula enters it (`bm-equation-in-frame`, `mb-display-dollars`: the key moved the caret into the neighbouring block) `arrowFromBefore` is null, `arrowFromBeforeMissed` lists `[key, selection after the key]` and `note` says so; `arrowFromAfter` is then the first entry |
| `sequences` | the key sequences, see below |
| `vertical` | Up and Down from offsets, see below |
| `grid` | clicks on a 6 px grid, see below |
| `documentUnchanged` | true: the capture never changed the document |
| `environment` | folder, file, window size, devicePixelRatio, zoom, Texpile, Chromium and Electron versions, MathLive version, OS, platform, DOM editor commit, `profile` |

## States

Every outcome is a state array:

```
[offset, selStart, selEnd, direction, caretX, caretY, caretHeight, selectionRects?, otherRanges?]
```

- `offset` is `position`; `selStart`, `selEnd` the first range of `selection.ranges`; `direction` is `n`, `f` or `b` (`selection.direction`).
- `caretX`, `caretY`, `caretHeight` are the `.ML__caret` element's rect relative to the live box (top-left corner, height). They are `null` while the selection is not collapsed, because MathLive removes the caret then.
- `selectionRects` (present only with a selection) lists every `.ML__selection` element's rect `[x, y, w, h]` relative to the live box, in DOM order. A zero-width rect is an empty slot MathLive draws for a fence or an empty group.
- `otherRanges` (present only when the selection has more than one range, as in matrix cell selections) lists the ranges after the first.
- A key that leaves the formula gives `["out", selectionType, anchor, head]`: the ProseMirror selection after the key (`text`, `node` or `gapcursor`, anchor and head positions, `head` null for a gap cursor).

`caretX` is the caret's left edge. The caret is 0 px wide in the DOM, so a canvas draws a hairline at that x.

## sequences

Each entry is a list of states, the first being the starting state, then one per key press, stopping at the first `out`.

| Key | Meaning |
|---|---|
| `RightFromStart` | offset 0, then Right until the formula is left (one `out` at the end) |
| `LeftFromEnd` | offset `lastOffset`, then Left until it is left |
| `ShiftRightFromStart`, `ShiftLeftFromEnd` | the same with Shift |
| `ShiftRightFromMid`, `ShiftLeftFromMid` | from offset `round(lastOffset / 2)`, four presses |
| `HomeEnd` | `[key, startOffset, state]` for `Home`, `End`, `Shift+Home` and `Shift+End` from offsets 0, 1/4, 1/2, 3/4 and the end of `lastOffset` (duplicates removed) |

Each start is placed with the field's `position` setter, so a sequence does not depend on an earlier one.

## vertical

`vertical.Up` and `vertical.Down` list `[startOffset, state]` for every offset from 0 to `lastOffset` (every `vertical.stride`-th offset plus the last when the stride is above 1, which only `th-display-multline` needs). Each start is set with `position` then one Up or Down is pressed. `ShiftUp` and `ShiftDown` do the same from the five offsets above. A key with no row above or below leaves the formula (`out`): Up gives a gap cursor or the text line above, Down the text below.

## grid

```
grid: { step: 6, x0: 3, y0: 3, origin, cols, rows, stride, skippedOutsidePane, stable, cells }
```

A click is made at client point `(live.x + x0 + 6 i, live.y + y0 + 6 j)` for `i < cols`, `j < rows` (`live` is `liveBoxes.live`). `cells` is row-major (`cells[j * cols + i]`) and holds the state after that press, or `null` for a point skipped. The field was live and focused before each press, so this is MathLive's own placing of the caret at a point, not the first-touch entry (that is `clickEntry`). `stride` above 1 means every `stride`-th point only (a 1600 point cap). 

To replay on the canvas: draw the formula, make the session live, and press at `point - contentDelta + contentInStatic` from the canvas formula box's top-left. Offsets and selections compare exactly. A point on the border between two atoms depends on MathLive's nearest-atom rule, so a replay that places the formula 1 px off will differ there; use the two offsets precisely.

Some points leave the formula (`out`): the press at those points ended with the caret outside the field (the live box has border and padding the glyphs do not fill). They are real outcomes and replay as such. `stable` is true when the live box's top-left did not move during the grid (a press that leaves the formula releases the live field, so its size is not compared).

## The formulas

| id | document | pos | kind | lastOffset | grid |
|---|---|---|---|---|---|
| `md-display-integral` | parity-md-root feature-sweep.md | 2766 | block | 24 | 23x8 |
| `md-display-pmatrix` | parity-md-root feature-sweep.md | 2823 | block | 17 | 36x9 |
| `md-inline-emc2` | parity-md-root feature-sweep.md | 2675 | inline | 7 | 11x5 |
| `md-inline-sum-frac` | parity-md-root feature-sweep.md | 2691 | inline | 19 | 22x9 |
| `pp-display-align-frac` | p2304 main.tex | 350221 | block align | 64 | 70x8 |
| `pp-display-align-text` | p2304 main.tex | 425352 | block align | 56 | 57x6 |
| `pp-display-big-brackets-frac` | p2304 main.tex | 259829 | block | 59 | 50x8 |
| `pp-display-cases` | p2304 main.tex | 415544 | block | 57 | 50x10 |
| `pp-display-inf-text` | p2304 main.tex | 237161 | block | 64 | 64x6 |
| `pp-display-prod-spf` | p2304 main.tex | 437485 | block | 31 | 26x9 |
| `pp-display-text-braces` | p2304 main.tex | 66144 | block | 42 | 52x7 |
| `pp-display-wide-frac-powers` | p2304 main.tex | 396348 | block | 74 | 53x10 |
| `pp-inline-big-frac-power` | p2304 main.tex | 396908 | inline | 47 | 33x7 |
| `pp-inline-frac-accent` | p2304 main.tex | 91738 | inline | 16 | 14x6 |
| `pp-inline-lim-sharp` | p2304 main.tex | 289109 | inline | 27 | 28x6 |
| `pp-inline-overline` | p2304 main.tex | 263913 | inline | 30 | 16x5 |
| `pp-inline-sum-limits` | p2304 main.tex | 77756 | inline | 19 | 16x9 |
| `pp-inline-text` | p2304 main.tex | 16821 | inline | 34 | 50x5 |
| `s1-display-array-left-brace` | s148 main.tex | 63918 | block | 45 | 41x12 |
| `s1-display-array-rl` | s148 main.tex | 64162 | block | 94 | 58x15 |
| `tb-display-sums-mbox` | parity-tex-tables main.tex | 10385 | block | 60 | 41x11 |
| `tb-inline-forall` | parity-tex-tables main.tex | 14702 | inline | 8 | 17x5 |
| `tb-inline-lim` | parity-tex-tables main.tex | 13171 | inline | 9 | 9x6 |
| `tb-inline-sqrt-frac` | parity-tex-tables main.tex | 17940 | inline | 15 | 21x6 |
| `tb-inline-sqrt-not-in` | parity-tex-tables main.tex | 13000 | inline | 10 | 10x5 |
| `tb-inline-sum` | parity-tex-tables main.tex | 7975 | inline | 11 | 8x9 |
| `th-display-chain` | parity-tex-theorems main.tex | 36712 | block | 36 | 52x6 |
| `th-display-det-sum` | parity-tex-theorems main.tex | 21552 | block | 35 | 63x6 |
| `th-display-leftright-set` | parity-tex-theorems main.tex | 34674 | block | 76 | 95x6 |
| `th-display-multline` | parity-tex-theorems main.tex | 22702 | block multline | 188 | 84x29 |
| `th-display-text` | parity-tex-theorems main.tex | 10452 | block | 64 | 89x6 |
| `th-inline-ldots` | parity-tex-theorems main.tex | 4199 | inline | 5 | 10x5 |
| `th-inline-leftright` | parity-tex-theorems main.tex | 2829 | inline | 7 | 14x5 |
| `th-inline-nested-braces` | parity-tex-theorems main.tex | 8170 | inline | 17 | 24x5 |
| `th-inline-setdiff` | parity-tex-theorems main.tex | 7408 | inline | 16 | 36x5 |
| `th-inline-subscripts` | parity-tex-theorems main.tex | 3807 | inline | 8 | 7x5 |
| `th-inline-text` | parity-tex-theorems main.tex | 7974 | inline | 26 | 38x5 |
| `ty-display-emc2` | parity-typ-drive matrix.pristine.typ | 165 | block | 7 | 13x6 |
| `ty-display-regression` | parity-typ-typst-paper main.typ | 734 | block | 14 | 22x6 |
| `ty-inline-residual` | parity-typ-drive matrix.pristine.typ | 131 | inline | 6 | 14x5 |

### Added formulas (P0e)

All are `block` except the last two inline ones; all captured at 1280x860, devicePixelRatio 1, zoom 1.

| id | document | pos | kind | lastOffset | grid | what it holds |
|---|---|---|---|---|---|---|
| `bd-display-gather-tag` | parity-tex-body main.tex | 1861 | block gather | 11 | 16x10 | `gather` with `\tag{*}` on the second row |
| `bd-display-alignat` | parity-tex-body main.tex | 1913 | block alignat | 33 | 74x6 | `alignat{2}` with `\nonumber` |
| `bd-display-flalign-notag` | parity-tex-body main.tex | 1992 | block flalign | 20 | 46x6 | `flalign` with `\notag` |
| `bd-display-dollars` | parity-tex-body main.tex | 2047 | block | 9 | 15x6 | `$$ ... $$` |
| `bd-display-in-paragraph` | parity-tex-body main.tex | 2088 | block | 10 | 12x10 | `\[ ... \]` written inside a paragraph (the editor splits the paragraph around it) |
| `bd-display-equation-label` | parity-tex-body main.tex | 2130 | block | 15 | 17x9 | `equation` with `\label{eq:one}` (the label is not in the field text) |
| `bm-equation-in-frame` | parity-tex-beamer main.tex | 1371 | block | 7 | 13x6 | `equation` in a frame |
| `bm-display-in-frame` | parity-tex-beamer main.tex | 1381 | block | 15 | 16x9 | `\[ ... \]` in a frame |
| `tb-typ-numbered-equation` | parity-typ-body main.typ | 1941 | block | 14 | 17x6 | Typst display equation with `<eq:one>` |
| `tb-typ-inline-sum` | parity-typ-body main.typ | 1969 | inline | 3 | 7x5 | Typst inline `$a + b$` |
| `mb-display-dollars` | parity-md-body main.md | 305 | block | 15 | 17x9 | Markdown `$$` block |
| `mb-inline` | parity-md-body main.md | 348 | inline | 14 | 15x5 | Markdown inline `$a^2 + b^2 = c^2$` |

`formula.source` of a multi-line environment is the whole `\begin ... \end` text, so `lastOffset` counts the environment's own source in the live field. The field shows `\tag{*}` and `\nonumber` as raw LaTeX text (the formula in the paper shows `(*)` or no number). No formula of a frame is anything but a top-level block of the frame content; `blockIndex` is the frame's index for the two `bm-*` formulas.

Chosen for variety: fractions (`tb-inline-sqrt-frac`, `md-inline-sum-frac`, `pp-inline-frac-accent`, `pp-display-big-brackets-frac`, `pp-display-align-frac`), nested and stacked fractions with powers (`pp-inline-big-frac-power`, `pp-display-wide-frac-powers`), a matrix (`md-display-pmatrix`), arrays (`s1-display-array-*`), cases (`pp-display-cases`), sub and superscripts (`th-inline-subscripts`, `pp-inline-lim-sharp`), `\left \right` (`th-inline-leftright`, `th-display-leftright-set`), `\text` (`th-inline-text`, `pp-inline-text`, `th-display-text`), accents (`pp-inline-frac-accent`, `pp-inline-overline`), big operators with limits (`tb-inline-sum`, `pp-inline-sum-limits`, `tb-display-sums-mbox`, `pp-display-prod-spf`), `align` and `multline` (`pp-display-align-*`, `th-display-multline`), inline and display, and three Typst formulas (`ty-*`, Typst math syntax).

## What was not recorded

- The two arrays (`s1-*`) come from `s148`, which is in the corpus folder but not in the parity set; the parity documents hold no `array` environment.
- No formula has a fraction inside a fraction in the parity documents; `pp-inline-big-frac-power` and `pp-display-wide-frac-powers` hold several fractions and powers side by side.
- `\eqref` neighbours were not recorded: parity-tex-body main.tex has no `\eqref` next to a formula.
- Only Linux was captured. macOS and Windows rows are pending (`environment.platform` is `linux`): Home and End and the word moves are keybindings of MathLive that its own table maps per platform; Chromium's documented defaults apply to the pane around the field.
- `p2304` formulas were captured in the DOM editor's plain profile on a document over LARGE_DOC_NODE_SIZE (`environment.profile` is `large-doc-plain`). The canvas breaks every document with Knuth-Plass (design 21.1), so the lines around them differ; a formula's own geometry does not depend on the profile.
- Ctrl and Alt moves (word and group jumps), Tab and typing were not recorded: the task asked for arrows, Home, End and Shift selections.
- Right and Left past the first or last offset leave the formula, recorded as `out` only; the re-entry beyond is `entries`.
- The caret blinks. The caret rect is read from the element, which the blink animation does not move, so a blink phase does not affect any number.
- `scrollTop` differs run to run for a formula far down `p2304` because the content above lays out lazily. The canvas should scroll to `blockIndex`, not to `scrollTop`.

## Repeatability

Added formulas: a second recording of `bd-display-gather-tag`, `tb-typ-inline-sum` and `mb-display-dollars` is identical in every offset, selection, out state and caret rect (`compare.mjs`, no difference). The first recording of `tb-typ-inline-sum` had `formula.scrollTop` 2613 against 2606 in the two later ones (content above had not finished laying out); the fixture is the later recording.

First formulas:

A second recording of five formulas (`th-inline-leftright`, `tb-inline-sqrt-frac`, `md-display-pmatrix`, `pp-display-align-frac`, `th-display-multline`) gave the same offsets, selections, out states and caret rects in every sequence, vertical row and grid cell; only `formula.scrollTop` differed (`compare.mjs` in texpile-tools).
