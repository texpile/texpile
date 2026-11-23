# Looks of the live states

Screenshots from the DOM editor (MathLive 0.110.0, DOM editor commit 6ec0389c61ffc889078a95517ee770740f556c7e), light and dark, for design 13.4 (the look of an entered formula, D23) and the chrome the canvas redraws (task checkbox, gap cursor, remote caret). `index.json` names every PNG.

The document is `docs/looks.tex` and `docs/looks.md`, opened as a folder in the window. Recorded on Linux under Xvfb by `perf-drive/parity/math/looks.mjs` and `chrome.mjs` in texpile-tools.

## index.json

One object per PNG:

| Field | Meaning |
|---|---|
| `file` | path under this folder: `math/<scheme>-<formula>-<state>.png` or `chrome/<scheme>-<thing>.png` |
| `scheme` | `light`, `dark`, or `dark-app-light-os` |
| `appMode`, `osScheme` | the app's mode (`data-mode` and `.dark` on `<html>`, as the app sets them) and the emulated `prefers-color-scheme` |
| `dpr` | device pixel ratio the shot was taken at: 2 for `math/`, 4 for `chrome/` (CDP `Emulation.setDeviceMetricsOverride`, window 1280x860 CSS px) |
| `clipCssPx` | the captured rect `[x, y, width, height]` in client CSS px; `pixels` is the PNG size (`clip * dpr`) |
| `formula`, `state`, `what`, `caretOffset`, `selection`, `note` | what the picture shows |

`dark-app-light-os` is the app in dark mode with the system scheme light. MathLive's own role colors (the fences around the caret, the text zone tint, the LaTeX-mode color, the placeholder color) follow the system scheme, not the app's mode (inventory M5), so this scheme shows the mismatch the design wants removed. It holds the entered and selection states only.

## math/ (2x)

Formulas, from `docs/looks.tex`: `inline` (`G =\left(  V, E  \right)` in a sentence), `display` (an integral with a fraction), `empty` (`$ $` inline) and `colored` (`x^2 + y^2` inside `\textcolor{red}{...}`).

Formulas added from the parity documents (`looksTargets.mjs` in texpile-tools names them; one window per folder, same states and schemes, no `placeholder`): from parity-tex-body main.tex `bd-gather-tag`, `bd-alignat`, `bd-flalign-notag`, `bd-dollars`, `bd-in-paragraph`, `bd-equation-label`; from parity-tex-beamer main.tex `bm-equation-in-frame`, `bm-display-in-frame`; from parity-typ-body main.typ `tb-typ-numbered-equation`, `tb-typ-inline-sum`; from parity-md-body main.md `mb-display-dollars`, `mb-inline`. Their files are `math/<scheme>-<formula>-<state>.png` like the others, and `index.json` records `formula` and `what` for each. The `dark-app-light-os` scheme holds `entered` and `selection` for these too (10 shots per formula).

| State | How it was made |
|---|---|
| `rest` | not entered: the caret beside the formula, the pointer away, the field not built |
| `entered` | entered by an arrow key, caret at the middle offset (`caretOffset`), the focus frame drawn |
| `selection` | `Shift+Right` three times from offset 0 (not for the empty formula) |
| `focus-frame` | entered with the caret hidden, so only the frame shows |
| `placeholder` | `inline` and `display` only: `setValue` with `\placeholder{}` slots (`silenceNotifications`, so the document is unchanged) and `moveToNextPlaceholder`, first slot selected |

The caret blinks, so the entered shots inject a stylesheet into the field's shadow root that stops the blink (`.ML__caret` animation none, opacity 1); nothing else is restyled. The `focus-frame` shots hide the caret with `visibility: hidden` the same way.

What the shots show for D23, as the numbers in `../math/*.json` confirm: the live field has a 1 px border (a visible frame in `entered`, none at `rest`), is larger than the static formula (an inline formula 2 px wider and taller, a pmatrix display 14 px wider and taller) and keeps the form-field text color, so in the `colored` shots the formula is black while the text around it is red.

## chrome/ (4x)

| File | Shows |
|---|---|
| `<scheme>-task-unchecked.png`, `-checked.png`, `-unchecked-hover.png`, `-checked-hover.png` | the Markdown task checkbox of `docs/looks.md` at rest and with the pointer over it |
| `<scheme>-gapcursor-between-displays.png` | the gap cursor between two display formulas |
| `<scheme>-gapcursor-before-table.png` | the gap cursor between a display formula and the table after it |
| `<scheme>-remote-caret.png` | a remote collaborator's caret with its name label |
| `<scheme>-remote-selection.png` | the same collaborator with a 28 character selection |

There is no second peer in a single window, so the remote collaborator is injected through the collaboration cursor plugin's own state: a transaction with the `remote-cursors` plugin's meta set to `[{ clientId: 7, name: 'Alex', color: '#7c3aed', anchor, head }]`, the call `setRemoteCursors` makes. The peer's caret and label come from the plugin's decorations (`pm-remote-caret`), not from an awareness provider.

The gap cursor is a `GapCursor` selection placed with `Selection.fromJSON({ type: 'gapcursor', pos })`; its horizontal bar is the plugin's `.ProseMirror-gapcursor` element.

Checkbox hover is the pointer moved over the 13 x 13 px `input[type=checkbox]` of the task list item.

## Decoration marks (`marks/`)

Screenshots of the 22 mark ids (listed in `styles/README.md`) at 4x device pixels in light and dark, for `parity-tex-body__main_tex` and `parity-md-body__main_md`: `marks/shots/<scheme>/<doc>/<id>.png`, indexed in `marks/index.json` like `doc/index.json`. A shot is the mark's rects and the lines it touches plus 12 CSS px, at least 240 px wide, with the editor blurred and the pointer away. An entry adds `step` and `state`, and `paintedCssPx`: the box of pixels that differ from the same clip without the mark, as `[x, y, width, height]` in CSS px relative to the clip. It is `null` for the suggestions, which move the layout, and for `peer-caret-rest`.

How each mark is set: comments, peers and suggestions through the producer's plugin meta (`texpile-comments`, `remote-cursors`, `texpile-suggestions`); the pending comment holds the range the composer would hold; find through Ctrl+F and the typed query; spelling as the proofreader's own inline decoration (`proofread-<kind>`) set as a view prop because the linter finds only what harper flags. `peer-caret` has the name label paused at the start of its animation (visible on arrival) and `peer-caret-rest` has it finished (hidden).

The DOM editor draws no agent mark. An agent's edit is a suggestion range, drawn as the `suggest-*` marks. The find shot includes the selection toolbar the editor shows over the selected match.
