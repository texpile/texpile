# Parity geometry from the DOM editor

Recorded from the DOM visual editor (texpile v2.0.1 plus the capture hook of branch `canvas/p0-dom`) by
`perf-drive/parity/geometry/` in texpile-tools. The line, hit and caret recordings left with the parity sweeps on
2026-11-24; the decoration marks stay for `reachRule.test.ts`. Everything here is the DOM editor's answer, so a difference in the canvas is a failure unless a
decision lists it.

## Files

Per document, `<folder>__<file>` has `/` and `.` replaced by `_` (`parity-tex-tables__main_tex`):

| File                    | Holds                                                                  |
| ----------------------- | ---------------------------------------------------------------------- |
| `<doc>@lines.json`      | line breaks of every textblock, recorded once while scrolling the file |
| `<doc>@p0.json` to `@p4.json` | hit grid, caret rects and face boxes at one of five scroll positions |

The documents are the 15 of design 18.2 (folders under `perf-drive/work/docs` in texpile-tools): `parity-tex-tables`,
`parity-tex-theorems`, `parity-tex-article`, `p2304` (all `main.tex`), `parity-typ-typst-paper` (`main.typ`),
`parity-typ-typst-report` (`chapters/method.typ`), `parity-typ-typst-slides` (`main.typ`), `parity-typ-drive`
(`matrix.pristine.typ`, `drawn.pristine.typ`, `gone-kinds.pristine.typ`), `parity-md-root` (`feature-sweep.md`,
`typing.md`, `getting-started.md`), `parity-md-markdown` (`README.md`) and `parity-md-latex` (`README.md`).

The supplement of design 18.2 (P0e) adds the files of five folders written after the coverage audit and of `parity-tex-apa`,
captured the same way and in the same format:

| Folder | Files |
| ------ | ----- |
| `parity-tex-beamer` | `main.tex`, `frames/extra.tex`, `variants/ctexbeamer.tex`, `variants/classic.tex`, `variants/notbeamer.tex` |
| `parity-tex-body` | `main.tex`, `part.tex`, `sections/input.tex` |
| `parity-tex-classes` | `llncs.tex`, `elsarticle.tex`, `revtex.tex`, `aastex.tex`, `svjour3.tex`, `wiley.tex`, `ieee.tex`, `amsbook.tex`, `report.tex`, `memoir.tex` |
| `parity-typ-body` | `main.typ`, `chapters/method.typ`, `thm.typ`, `slides.typ`, `crlf.typ`, `bom.typ` |
| `parity-md-body` | `main.md`, `crlf.md` |
| `parity-tex-apa` | `main.tex` |

Many of these files are a few blocks long. Their positions repeat each other (the pane clamps at the scroll limit) and `scrollTop` says so.
`variants/*.tex`, `part.tex`, `sections/input.tex` and the class files are opened as files of their folder, each as its own document.
The Windows and macOS rows stay pending as for the first 15.

## Environment (`env` in every file)

`folder`, `file`: the document. `window`: `userAgent`, `devicePixelRatio` (1), `innerWidth` x `innerHeight` (1280 x 860 CSS px).
`os`, `electron`, `chromium`: platform and versions. `domCommit`: commit of the DOM editor build. `zoom`: 1 (the app's
`uiZoom` default). `cell`: grid pitch (20). `gap`: 8. Screen files add `scrollIndex`, `fraction`, `position` (0 to 4), `blocks`
(top-level block count), `docSize` (`doc.nodeSize`) and `rootClass` (the editor root's classes: `pm-lines-plain` marks the large document profile).

## Coordinates and units

All lengths are CSS px at devicePixelRatio 1, rounded to 0.01. Positions are ProseMirror document positions of the open
file's document (stable for a given file; the capture never edits).
The pane is the editor's scroller: the nearest ancestor of the editor root that scrolls (the first `overflow: auto|scroll`
ancestor when the document is shorter than the pane). `pane` is its client rect in window CSS px
(`left`, `top`, `width`, `height` of the padding box, scrollbar excluded). Window coordinates are
viewport coordinates, the same ones `getBoundingClientRect` and `posAtCoords` take.

## Scroll positions (`@p0` to `@p4`)

For `f` in 0, 0.2, 0.4, 0.6, 0.8: block index `min(blocks - 1, floor(f * blocks))` over the top-level children of the
document. The pane is scrolled so that block's top sits 8 px below the pane's client top (`scrollTop += blockTop - paneTop - 8`),
then again after settling. Settling is `document.fonts.ready` and a main thread that stays idle for 500 ms. A document
shorter than the pane, or a position at the end, clamps at the scroll limit: `scrollTop` and `scrollHeight` record what
happened, and the files of such positions can repeat each other. Fixtures of one document are captured after its `@lines.json` pass, which scrolls
through the whole file once.

## Screen files (`@p0` to `@p4`)

| Field                          | Meaning                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `scrollTop`, `scrollHeight`    | scroller state at capture                                                                    |
| `pane`                         | the pane's client rect in window coordinates                                                 |
| `cols`, `rows`                 | `floor(pane.width / 20)`, `floor(pane.height / 20)`                                          |
| `pmPos`, `pmInside`            | `view.posAtCoords({left, top})` as `pos` and `inside` (`null` when it answers `null`)        |
| `browserPos`                   | the browser's own caret place, a ProseMirror position or `null`                              |
| `carets`                       | rows `[pos, l-, r-, t-, b-, l+, r+, t+, b+]` of `coordsAtPos`                                |
| `faces`                        | rows `[pos, type, left, top, width, height, elements]`                                       |

Hit grid: the three arrays are row-major (`index = row * cols + col`). The point of cell `(col, row)` is
`pane.left + col * 20 + 10`, `pane.top + row * 20 + 10`, the center of each 20 px cell of the pane, in window coordinates.
`pmPos`/`pmInside` come from `view.posAtCoords`. `browserPos` is `document.caretPositionFromPoint(x, y)` mapped with
`view.posAtDOM(offsetNode, offset)`, `null` when the node is outside `view.dom`. The grid reads points only (no click),
so the gap cursor or node selection a click makes is left to the click rules part of P0.
In the supplement files (beamer, body, classes, typst body, markdown body, apa) `browserPos` is `null` wherever `pmPos` is `null`, because
Chromium's answer outside the content differed between runs. Those files are captured with the editor blurred and no selection, the
mouse parked at (2, 2), and each `browserPos` cell is the value most of 7 samples agree on. The first 15 documents keep every cell.

Caret rects: every position `p` from the start to the end of every textblock that overlaps the pane (that covers each position
beside an inline atom), kept when either rect overlaps the pane. `-` is `view.coordsAtPos(p, -1)` and `+` is `coordsAtPos(p, 1)`,
each as left, right, top, bottom relative to the pane's client top-left (`pane.left`, `pane.top`). Positions between blocks
(gap cursors) are not recorded.

Face boxes: every node view that draws itself (a desc with a custom node view spec, or any atom other than text) whose
outer element overlaps the pane. `pos` is the position before the node, `type` the node type name. `left`, `top`,
`width`, `height` are the outer element's border box relative to the pane's client top-left. `elements` lists each
descendant element of the outer element as `[path, left, top, width, height]`, boxes from `getBoundingClientRect` relative to the
outer element's border box top-left. `path` runs from the outer element's child down, each step `tag.class1.class2:index`
with the index among element siblings (`span.math-static-placeholder:0>span.ML__latex:0`). Nested node views get their own
face row and are left out of their parent's `elements`. Shadow roots are not entered (a `#shadow` entry marks the host).

## Line files (`@lines.json`)

`blocks` holds one entry per textblock of the document (every paragraph, heading, caption, cell paragraph, ...), in position order:

```
{ pos, type, profile, box: [width, height], irregular, lines: [ [from, to, text, top, height, baseline, hyphen, justified, left, right], ... ] }
```

- `pos`: position before the textblock; `type`: its node type name; `box`: its border box.
- `irregular`: count of text nodes skipped because their DOM text does not map one to one onto document positions (zero for ordinary text).
- `profile`: the line-break profile the DOM editor used. `held` is a paragraph or heading held to Knuth-Plass breaks and justified
  (`pm-line-par pm-line-justified`). `held-ragged` is held without justification (headings, ragged text). `greedy` is
  the browser's own greedy wrapping (captions, notes, term titles, table cells). `large-doc-plain` is the document over
  `LARGE_DOC_NODE_SIZE` (150,000) with `pm-lines-plain` on the root; the canvas breaks it with Knuth-Plass by decision (design 21.1),
  so those lines are a record and not a target.
- Line fields: `from`, `to` are document positions; `text` is `doc.textBetween(from, to)` with an inline atom as U+FFFC
  (a citation, label or math node holding text shows that text). A collapsed space at a line end stays with the line it follows.
  `top`, `height`: the union of the line's text rects (Range client rects) and inline atoms, relative to the block's border box top.
  `baseline`: the first text rect's top plus the font's ascent (canvas `fontBoundingBoxAscent`, the width-independent value for
  the run's font), relative to the block's border box top; `null` for a line with no text. `hyphen`: 1 when the line ends inside a
  `pm-line-hyphen` span, which draws an inserted hyphen as generated content. `justified`: 1 when the block is
  `text-align: justify` and the line is not its last. `left`, `right`: horizontal extent of the line's boxes relative to the block's border box left.
- How lines are found: each text node is split into line fragments by binary search over `Range` rects of its characters
  (a character belongs to the rect line it sits on; collapsed spaces take the previous line). Fragments and atoms are
  sorted by position and a new line starts when the next one begins left of the previous one's start or at or below the line's bottom.
- A textblock is read while it is on screen during a scroll through the file in 0.8-pane steps, so the lazy content of a large document is laid out.
  `textblocks` counts all textblocks, `captured` those read and `missing` the positions never read.

## Determinism

A repeat capture of one document (all five positions and the lines file) from a window launched afresh gives byte-identical files.
Values are rounded to 0.01 px so layout noise below that is not recorded.
The first capture after a cold window start can differ in a few `browserPos` points at the pane edge on a table row (first 15 documents only).
The supplement files were captured twice from fresh windows (beamer, apa and the rest) and the repeats are byte-identical.

Class paths leave out the theme classes CodeMirror generates (`ͼ1`, `ͼ18`), because CodeMirror numbers them per session.

## Decoration marks (`<doc>@marks.json`)

Recorded by `perf-drive/parity/marks/` in texpile-tools for `parity-tex-body__main_tex` and `parity-md-body__main_md`: the DOM editor's rects of each decoration mark, for the canvas's reach rule and look geometry. One mark is set at a time through its producer's plugin meta. The document has few paragraphs of two lines, so marks of one document share them.

| Field | Meaning |
| ----- | ------- |
| `env` | document, window 1280 x 860, `geometryDpr` 1, versions, `domCommit`, `dpr` 4 of the shots |
| `plan` | the textblocks used and, per mark, its ProseMirror range or place |
| `schemes.<light or dark>.<id>` | one record per mark (ids in `styles/README.md`) |

A record: `pm` (the range, `null` for a caret or a find), `found` (elements or ranges the mark produced), `block` and `elements`.

`block`: `pos`, `type`, `box` (`[width, height]` of the textblock), `contentTop`, `lineHeight` and `lines`, one per line: `from`, `textTop` and `textHeight` (the content area of the text), `lineTop` and `lineHeight` (the line box) and `exact` (the lines are a uniform `lineHeight` apart, so the line box is the content top plus `index * lineHeight`; otherwise it is the center of the text box).

`elements`: the decorated spans or widgets (`tag`, `class`, `text`) with their `getClientRects()` as `rects`: `x`, `y`, `w`, `h` relative to the textblock's border box, `line` (the line with most overlap) and `reach` (`line` when the rect has the line box's top and height within 1.5 px, else `text`). Find has no span: its rects come from the `Range`s of the `find-match` and `find-current` highlights and from `[data-find]` elements (a formula), limited to the textblock of the current match.

Peer carets are a widget with the name label inside it. The bar is the host's `::before`: `left -1px`, the host's height, the width in `styles/<doc>@<scheme>.marks.json`.

Light and dark differ by up to 6 px in x on a justified line (the line breaker lays the same words out slightly differently), so the light scheme is the reference.
