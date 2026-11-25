# Document looks

Screenshots of document content and editor states from the DOM editor, for the canvas branch's paint specs (design 18.2 and 18.3). Each picture is one element in one state, light and dark. `index.json` names every picture.

DOM editor commit `6ec0389c61ffc889078a95517ee770740f556c7e` (the build at `/home/user/wt/p0-dom`). Recorded on Linux under Xvfb by `perf-drive/parity/looks/looksDoc.mjs` in texpile-tools, which also holds the targets (`looksDocTargets.mjs`) and the command that reruns them.

## Environment

Every folder has an entry under `environment` in `index.json`:

| Field | Value |
|---|---|
| `documentFolder` | the folder opened in the window (the files are in `perf-drive/work/docs` of texpile-tools) |
| `windowCssPx` | `[1280, 860]` |
| `devicePixelRatio` | 2 (CDP `Emulation.setDeviceMetricsOverride`); every PNG is twice its clip size |
| `zoom` | 1 |
| `electron`, `chromium` | 44.9.3 and 152.0.7977.167 |
| `os` | Linux 6.18 x64 |
| `domEditorCommit` | the DOM editor commit above |

## index.json

`{ environment, shots, impossible }`.

One object per PNG in `shots`:

| Field | Meaning |
|---|---|
| `id` | the target: `bm-` beamer, `bd-` tex body, `cl-` tex classes, `ap-` apa, `ty-` Typst body, `md-` Markdown body, `em-` empty files |
| `file` | `shots/<scheme>/<id>-<state>.png` |
| `folder`, `docFile` | the document folder and the file in it that was open |
| `locator` | how the element was found, see below |
| `state` | the state, see below |
| `scheme`, `appMode`, `osScheme` | `light` or `dark`: the app mode (`data-mode` and `.dark` on `<html>`) and the emulated `prefers-color-scheme`, always equal here |
| `dpr` | 2 |
| `scrollTop`, `scrollerBox` | the editor scroller's `scrollTop` after scrolling to the element, and its box `[x, y, width, height]` in client CSS px |
| `elementBoxCssPx` | the located element's box `[x, y, width, height]` in client CSS px at that scroll position (origin is the window's top left) |
| `clipCssPx` | the captured rect in client CSS px: the element box plus the padding (8 px, 12 px on chips, 60 px more on the left for `gutter`), cut to the editor pane. `pixels` is the PNG size, `clipCssPx` times `dpr` |
| `clippedToPane` | present and true when the element is taller than the pane and the picture shows its top part |
| `what`, `note` | what the element is, and how a state was made when that is not obvious |

`impossible` lists targets that were not shot, each with `id`, `folder`, `state` and `reason`.

## Locators

The window opens the document, then the script finds the element in the live ProseMirror document (`globalThis.__p0.editorViewStore.current`):

| Form | Meaning |
|---|---|
| `{ type, text, nth }` | the `nth` (default 0) node of ProseMirror node type `type` whose text content matches the regular expression `text`; its DOM is `view.nodeDOM(pos)` |
| `{ css, text, nth }` | the `nth` element of `.ProseMirror` matching a selector, with the same text test; `.ProseMirror > *` is the top level block list |
| `closest` | climbs to the closest ancestor matching a selector (a chip's paragraph) |
| `{ range: [a, b] }` | the union box of two locators |

A canvas test finds the same node by type, text and index in its own document, scrolls it so the top sits 70 px below the pane top (44 px when the element is taller than the pane) and compares with the picture.

## States

The editor is reset before each picture: the selection moves to the end of the document, the editor loses focus and the pointer goes to the window corner.

| State | How it was made |
|---|---|
| `rest` | the reset only |
| `hover` | the pointer moved to the element's center (700 ms wait for delayed hover UI) |
| `focus` | the caret placed in the first text position inside the node by a selection transaction, then the picture within 450 ms (the browser's own caret blinks and is on for the first 500 ms after a move) |
| `click` | a real click inside the element (the link tooltip appears for a caret in a link) |
| `nodesel` | a `NodeSelection` on the node |
| `textsel` | a text selection over all the node's text, editor focused |
| `blurred` | the same selection, then the editor blurred: the held selection |
| `range`, `rangeblur` | a text selection from the start of the first locator to the end of the second, focused or blurred |
| `cellsel` | a `CellSelection` between two cells (the 0-based indexes of the table's cells in document order are in the target's `opts.cells` in `looksDocTargets.mjs`) |
| `resize` | the pointer on the right border of the table's first cell (the column resize handle) |
| `gutter` | the pointer at the block's left edge so the block handle and the plus button show |
| `readonly` | the view's `editable` prop set false |
| `dropline` | a synthetic `dragover` just under the element: the drop cursor plugin draws its line |

Each picture waits for `document.fonts.ready` and three animation frames. Before each picture the transitions and animations still running finish (a fading hover handle), and the math field's own blinking caret is hidden in every state but `focus`. A repeat run of the whole parity-md-body folder (130 pictures) was byte identical, twice. A second run of 40 pictures (apa, empty files and the ctexbeamer title slide, with `rest`, `hover`, `focus` and `nodesel`) was also byte identical. The other folders were recorded before the two waits were added.

## Documents

The documents are `perf-drive/work/docs` of texpile-tools. Three folders are copies with additions, kept in `docs/` here:

| Folder | Difference |
|---|---|
| `parity-tex-beamer` | `looks.tex` added: blocks with and without a title for every block kind, block and exampleblock overlays, `frame<2->{Title}`, a theorem and a lemma with overlays |
| `parity-tex-beamer-nofields` | `main.tex` is `variants/ctexbeamer.tex` without `\title` and `\author`: the title slide without fields |
| `parity-empty` | `empty.tex`, `empty.typ` and `empty.md`, zero bytes: the placeholder line |

## Counts

Pictures per folder, light and dark each: parity-tex-beamer 140, parity-tex-beamer-nofields 5, parity-tex-body 188, parity-tex-classes 57 (19 classes: the title block at rest and hovered, and the first heading), parity-tex-apa 9, parity-typ-body 106, parity-md-body 65, parity-empty 6. 576 PNGs per scheme (1152 in all, about 22 MB).

## Things to know

- `\today` shows the capture date (2026-11-17) in the beamer title slides and the body title. A replay on another day differs there.
- The date and the page numbers in a frame corner are the DOM editor's own text.
- The caret is the browser's own and blinks; only `focus` and `focus-hover` pictures show it. Compare carets by position in `geometry/` and `keys/`.
- `readonly` is the view's `editable` prop set false. The app's read-only paths (a guest's session, a version view) need a session or a git history and were not opened.
- `dropline` is made by a synthetic event because CDP cannot hold a native drag. The line the plugin draws is the same.
- Not shot, with the reason in `impossible`: `bm-againframe-top-level` (the DOM editor holds no separate node for an `\againframe` between frames, the parse puts it in the inline chip of the frame before) and `md-frontmatter` (the document has no node for front matter).
- A selection that crosses blocks uses the text selection of the DOM editor: the highlight rects are the browser's, one per line box.
- The editor pane clip starts 30 px under the scroller top so the sticky formatting toolbar stays out of the pictures. A picture taller than the pane is cut at the pane bottom (`clippedToPane`).

## Node selection shots by node type

Ids do not carry the node type, so this table maps each one. The state is `nodesel`.

| Node type | Shot ids |
| --- | --- |
| `block_math` | `bd-math-gather` (parity-tex-body), `ty-equation-labeled` (parity-typ-body), `md-math-block` (parity-md-body), `bm-equation-frame` (parity-tex-beamer) |
| `horizontal_rule` | `bd-hrule`, `ty-line`, `md-thematic-break` |
| `image` | `bd-node-selection-image`, `bd-image-alone`, `ty-image-wide`, `bm-image-frame` |
| `list` | `bd-node-selection-list` |
| placeholder chip | `bd-maketitle`, `bm-pause-chip`, `bd-definitions-grid`, `bm-raw-chip-frame`, `ap-maketitle` |

## Approximated states

`readonly` and `dropline` approximate the real states (see Things to know). Not shot: a node selection on a placeholder chip in the classes folder (only the title block at rest and hovered are shot there).
