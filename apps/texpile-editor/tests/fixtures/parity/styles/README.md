# Parity styles from the DOM editor

Computed styles of the DOM visual editor (texpile v2.0.1 plus the capture hook of branch `canvas/p0-dom`), recorded by
`perf-drive/parity/styles/` in texpile-tools. The canvas takes exact values from these files and `styleParity` compares every
resolved canvas style with them. A difference is a failure unless `deviations.json` lists it with the decision that accepts it.

## Files

Per document, `<folder>__<file>` has `/` and `.` replaced by `_` (`parity-tex-body__main_tex`).

| File | Holds |
| ---- | ----- |
| `<doc>@<scheme>.json` | every element, pseudo-element and text run of the document under one scheme |
| `<doc>@<scheme>.states.json` | the elements that change in a hover, focus or selection state of the looks targets of that document |
| `deviations.json` | accepted differences between the canvas and these files; empty at S1.0 |

Documents: the 42 of `geometry/README.md` (the first 15 and the supplement folders), the same files and names.

Schemes (the `scheme` field of `env`):

| Scheme | Setting | Documents |
| ------ | ------- | --------- |
| `light`, `dark` | theme (`data-mode` and the `dark` class on `html`, as `theme.ts` sets them) | all 42 |
| `page-light`, `page-dark` | page view (the `page-view` class on the editor root) | `parity-tex-body/main.tex`, `parity-typ-body/main.typ`, `parity-md-body/main.md` |
| `zoom` | editor zoom 1.25 (`zoom: 1.25 !important` on the editor root), light | the same three |
| `font` | editor text font `"Georgia", var(--typo-base--font-family)` (`--editor-text-font` on `html`), light | the same three |
| `narrow` | window 700 CSS px wide (below Tailwind's `md` breakpoint of 768 px), light | `parity-md-body/main.md` |
| `light-nojustify`, `light-nohyphen` | `visualJustify: false`, `visualHyphenate: false` in settings, light | `parity-tex-body/main.tex` |

The states files exist for `light` and `dark` over the folders of `perf-drive/parity/looks/looksDocTargets.mjs` (`parity-tex-beamer`,
`parity-tex-beamer-nofields`, `parity-tex-body`, `parity-tex-classes`, `parity-tex-apa`, `parity-typ-body`, `parity-md-body`, `parity-empty`).
Their documents are the looks copies (`looks.tex` and the other extras of `looks/README.md`).

## Environment (`env` in every file)

`folder`, `file`, `scheme`; `rootClass` (the editor root's classes), `docSize` (`doc.nodeSize`), `innerWidth` x `innerHeight`,
`devicePixelRatio` (1), `domElements` (elements under the root when read), `electron`, `chromium`, `os`, `domCommit` (commit of the DOM
editor build), `read` (how the styles were read), `truncated`, and the scheme's own fields (`theme`, `pageView`, `editorZoom`, `textFont`, `windowWidth`).

## Reading a file

```
{ env, initial, values: { layout, paint, run }, rows, runs }
```

`values.layout`, `values.paint` and `values.run` hold each distinct value once, as `LayoutStyle`, `PaintStyle` and `RunStyle` of
`canvas/contracts/styleTypes.ts` (the shapes of canvas `m2-fix-r1`) with the ids and keys left out. A value is sparse: only the keys that
differ from `initial` are written, nested objects the same way, so a missing key equals the key of `initial.layout` or `initial.paint`.
`initial` is the parsed style of an element with every property at its CSS initial value.
`expand(delta, base)` is a recursive merge: where `delta` and `base` are plain objects, merge key by key; anywhere else `delta` wins when present
and `base` stands in when `delta` is missing (arrays and `null` count as values). `perf-drive/parity/styles/styleValues.mjs` has `expandFile(file)`.

A `values.run` entry is a `RunStyle` without `id`, `layoutKey` and `paintKey`; its `font` is sparse against `initial.layout.font` and its
`paint` against `initial.paint`.

Colors are `{ r, g, b, a }` with each channel 0 to 1 (sRGB, as `colorValue.ts` parses Chromium's answer); the 2/255 tolerance of
the plan is 0.00784. Lengths are `{ px, percent }` or a keyword, line heights px or `'normal'`, font sizes px.

`rows`: `[pos, nodeType, path, pseudo, layoutId, paintId]`, one per element in document order and per pseudo-element after its element.
- `pos`: position before the node, the one `faces` rows of the geometry files use; `-1` for the root (`.ProseMirror`, node type `doc`).
- `nodeType`: the ProseMirror node type of the nearest node view that holds the element; `path`: `''` for that node view's outer element, else
  the path to the element, steps `tag.class1.class2:index` with the index among element siblings, joined by `>` (the geometry convention, CodeMirror's
  generated `ͼ` classes left out, SVG elements without classes because their `className` is not a string).
- `pseudo`: `''`, `before`, `after` or `marker`. A `before` or `after` row exists when the computed `content` is neither `none` nor `normal`; a `marker` row for
  every `display: list-item` element.
- `layoutId`, `paintId`: indexes into `values.layout` and `values.paint`.
- A plain node (a paragraph, a list item) is its own node view here; geometry lists it among the `elements` of the nearest face above it. A face row of
  geometry joins its style row by `pos` and `type` with `path` `''`.

`runs`: `[textblockPos, from, to, chain, runId]`, one per text node of a textblock: `from`, `to` document positions of the text, `chain` the elements between
the textblock's content element and the text, outermost first, each `tag.class1.class2` (a mark element, an inline decoration or a widget), and `runId` an index into
`values.run`, the style the canvas's `runOf` gives for that chain over the textblock's own computed style.

## How the styles were read

Every element was read with `getComputedStyle` while the editor's host element was `display: none`, set and restored in one task. A hidden subtree answers with
computed values: `width: auto`, `height: auto`, margins and offsets as declared, `line-height` in px, colors resolved (`light-dark()`, `color-mix()`, `var()` and `currentcolor`
included), `content` with `attr()` resolved. Pseudo-elements are read the same way. The values are what the canvas has to resolve from declared styles and
inheritance.

The window is 1280 x 860 CSS px at devicePixelRatio 1, the editor blurred, the selection cleared and the pointer at (2, 2) before every read, as in the geometry capture. A
document is scrolled through once first so lazy content exists.

## What is left out

- CodeMirror: the rows go down to `.cm-line` and the token spans inside it. `.cm-editor`, `.cm-scroller` and `.cm-content` are rows; gutters, layers and tooltips are not.
- MathLive and static math: the host element only (`math-field`, `.ML__latex`, `.katex`); nothing inside.
- A document with more than 12000 rows keeps the first blocks up to the cap and any later block that holds a kind (node type, tag, classes) no earlier block had;
  `env.truncated` says how many blocks were taken. `p2304/main.tex` (over 150000 `nodeSize`, 295000 DOM elements) is read at the five scroll positions of the geometry fixtures,
  2400 rows each, a fresh page for each; `env.positions` lists them and `env.largeDocument` is true.

## Path rules for `styleParity`

Elements that exist only in the DOM editor are skipped by path:
- `img.ProseMirror-separator` and `br.ProseMirror-trailingBreak`: ProseMirror's hacks for an empty textblock end, which the canvas does not build (342 and 174 rows).
- Elements of a `ProseMirror-widget` whose canvas counterpart is a decoration face, not a node: compare them through the run `chain` they sit in.
- Rows under `.cm-editor`, `.cm-scroller`, `.cm-content`, `.cm-line` (CodeMirror's own DOM) compare by the host row only.
- `span.ML__latex` and the other math hosts: compare the host row only.

## Determinism

Two full recordings of the light scheme over the 42 documents, a restart of the window in between, differ only in `env.os` (the kernel string of the machine). Every row, run
and value table is identical.

## Size

158 files, about 9.6 MB: 99 recordings (42 documents x light and dark = 84, and 15 of the extra schemes and settings above; `p2304` holds five scroll positions in one file per scheme) and 58 states
files. A value that occurs more than once in a file is stored once in `values` and rows point to it, a value equal to the initial style is left out, so a document of 25000
elements holds a few hundred values. The largest file is `p2304__main_tex@*.json`.

## Decoration marks (`<doc>@<scheme>.marks.json`)

Run styles of the blocks that hold decoration marks, for `parity-tex-body__main_tex` and `parity-md-body__main_md` in light and dark, recorded the way the files above are (host `display: none`, same value tables and `LayoutStyle`, `PaintStyle` and `RunStyle` parsers). The file is `{ env, marks }`. Each entry of `marks` is the recording of the textblock that holds one mark with the mark set: `id`, `block` (its position), `range` (its ProseMirror range, `null` for a caret or a find) and the fields of a style recording (`rows`, `runs`, `values`, `initial`). The decorated span is a level of the `runs` whose text lies in `range` (a `proofread-*` class, `pm-range pm-comment`, `pm-remote-sel`, `pm-suggest-new`); a widget (`pm-remote-caret` and its label, `pm-suggest-old`, `pm-suggest-break`) is an element of `rows`. A find has `highlights`: the computed `background-color`, `color`, text decoration and `text-shadow` of `::highlight(find-match)` and `::highlight(find-current)`, because a highlight has no element.

Mark ids: `comment`, `comment-focused`, `comment-pending`, `peer-caret`, `peer-caret-rest`, `peer-selection`, `find`, `proof-spelling`, `proof-typo`, `proof-capitalization`, `proof-wordchoice`, `proof-style`, `proof-repetition`, `proof-grammar` (the default look), `suggest-replace`, `suggest-insert`, `suggest-delete`, `suggest-break`, `suggest-break-added`, `suggest-replace-focused`, `suggest-partial` and `suggest-gone`.
