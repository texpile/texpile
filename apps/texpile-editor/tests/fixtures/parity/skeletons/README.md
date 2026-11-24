# Svelte node view skeletons

The DOM skeleton of each Svelte component that mounts inside a node view (design 8.4). A canvas face that replaces
the component compares its tree with the file of the same name (`expectSkeleton(face, 'EnvironmentHead')`).

## Files

One file per component (the first 16 are the node view components; the panel parts listed under "Panel parts" were added
later, and `components/` holds the rest): `CitationDisplay`, `RefDisplay`, `LabelDisplay`, `EnvironmentHead`, `FrameChrome`,
`IncludeDocDisplay`, `BibliographyView`, `BibKeyChip`, `TableWrapperComponent`, `TypstEnvHeader`, `TypstRefDisplay`,
`TypstLayoutGear` (the gear `TypstLayoutView` mounts), `FigureCard`, `ImageOverlay`, and the bibliography widgets
`BibliographyHeading` and `BibliographySettings`. `crosscheck.json` holds the same skeletons read from the running DOM
editor.

## Format of `<Component>.json`

```
{ component, source, mountsInEditorAs, states: { <state>: { roots: [Node], portal?: [Node] } } }
Node = { tag, class?: string[], attrs?: { name: value }, children?: (Node | string)[] }
```

- `roots` are the elements the component renders into its mount target, in order.
- `class` keeps source order. Svelte scoped classes (`svelte-<hash>`) are removed because the hash changes with the build.
- A string child is a text node. A text that comes from a fixture prop is replaced by `{name}` (`{label}`, `{number}`).
  Text that is the same for every prop (a message such as `Add title`, a separator, a space) stays literal. A string
  made only of spaces is a real whitespace node Svelte emits between blocks. Canvas faces reproduce it because the
  editor keeps white space.
- Element ids and `aria-controls` have the form `popover:<id>:trigger` with the generated number replaced by `«id»`.
  `data-ownedby` is `«id»`.
- SVG icons keep their tag, classes and attributes. Geometry attributes (`d`, `points`, coordinates) of their children
  are dropped.
- `portal` appears for the open citation state only: the popover shell Zag portals to `body`, cut at depth 3 (`...` is a
  cut). The contents of a popover (the settings forms) belong to the Svelte component that stays mounted as an overlay.
- Dialect, template features and the stores a component reads are set per state (the state name says which).
  Entries shown in `BibliographyView` come from three fixture references and are not placeholders.

## States per component

Each file lists its states by name. The set covers the branches of each template: resolved, unresolved and loading
citation, open popover, counted, uncounted and `\eqref` reference, label with and without the duplicate problem,
theorem (numbered, note, LaTeX note, unnumbered), proof (plain and custom head), `center`, `flushright` and box
environment heads, frame with a missing title, a missing subtitle, both and a title slide, `\input`, `\include`, missing
and Typst includes, empty, 6, 7 and expanded bibliographies, filled and empty key chips, both table wrapper dialects with
caption supported or not, Typst environment label with and without `<label>`, Typst refs (citation, label, unknown),
the gear with no cells, 1 cell and 3 cells, figure card (placeholder, no summary, svg, compiled, guest) and the image
overlay for LaTeX, an unreadable crop, Typst and Markdown.

## How it was made

`tests/unit/tools/parity/skeletons.tool.test.ts` (jsdom, inert unless `WRITE_PARITY_SKELETONS=1`):

```sh
cd apps/texpile-editor
WRITE_PARITY_SKELETONS=1 npx vitest run tests/unit/tools/parity/skeletons.tool.test.ts
```

It mounts each component with `svelte`'s `mount`, flushes, and serializes the DOM with `skeletonSerializer.ts`.

## Cross-check against the running DOM editor

`crosscheck.json` (`perf-drive/parity/verify/skeletonsLive.mjs` in texpile-tools) has, per component, every distinct
skeleton found in the DOM editor (`live`, with the document it came from) and the closest jsdom state with the
differences (`comparison`). The documents were the parity documents `parity-tex-theorems`, `parity-tex-tables`,
`parity-typ-typst-report`, `parity-typ-typst-paper`, `parity-md-latex/images.md` and three small documents made for the
elements the parity set lacks (beamer frames, `\input` and a bibliography, a Typst callout and grid).

Result: every component's live skeleton matches a jsdom state in tags, classes, attribute names and child structure.
The differences that remain are data: `data-style=definition` against `plain` (the closest state is a different theorem
style), and one bibliography entry whose last part is `text-muted` in the live data.

## What jsdom changes and what it cannot record

- jsdom lays out nothing. Skeletons carry no sizes, positions or computed styles. The live DOM numbers belong to the
  geometry fixtures.
- `ImageOverlay` is mounted inside an `div.imagePluginRoot` with a `.text` caption stand-in because its effect reads
  them. The overlay's `--caption-height` custom property is set on that root and is not part of the skeleton.
- Zag popovers render the same attributes in jsdom as in Electron. `data-placement` and `data-side` appear only while a
  popover is open (the `open` citation state).
- `isReadOnly` is a constant false in this offline fork, so no `disabled` state of the gear buttons exists in any file.
  A face adds `disabled` itself when the canvas editor is not editable.
- A LaTeX theorem note with a macro (`[the \emph{big} one]`) draws as its source text in both jsdom and the DOM editor
  (`latexFace` draws only what the face table knows), so the file holds the source text.
- The Typst theorem head (`button.env-head[data-look=theorem]` filled by `use:showTheoremHead`) needs a theorem package
  in the document's scope. No theorem package was available in this container, so only the plain label state of
  `TypstEnvHeader` is recorded. The theorem head is the same `button.env-head` with `data-look="theorem"` as in
  `EnvironmentHead`, holding the drawn markup directly.
- `BibliographySettings` and the popover contents of the other components were recorded in jsdom only. They are
  controls that stay Svelte.

## Panel parts (jsdom)

The pieces every drawn chip panel and settings popover is built from, mounted in jsdom like the files above:
`PanelHeader`, `PanelRow`, `PanelSegments`, `PanelChoices`, `PanelSwitch`, `PanelTextArea`, `PanelTextField`,
`PanelButton`, `ChipPanelFooter`, `TableLinesSetting` and `PaperCropBar`. Same format as `<Component>.json`. A text
that comes from a prop is `{title}` in `PanelHeader` and a literal elsewhere (the fixture prop value, `Label`).

## Components opened in the DOM editor (`components/`)

The audit (`plans/canvas-rewrite/parity-coverage.md`) found 15 mounted Svelte components and 49 settings, popover, panel
and toolbar components with no skeleton. `components/` holds one file per component, opened in the running DOM editor
the way a writer does it (click the chip, hover the block and click its gear in the block handle, press the key). The
script is `perf-drive/parity/verify/componentsLive.mjs` and its scenario list is `componentScenarios.mjs`.

Files:

- `components/<Component>.json`: `{ component, source, status, jsdom?, crosscheck?, reason?, via: [...] }`.
  `status` is `captured` (opened by a scenario in `via`), `captured-in-crosscheck` (lies in a parity document and is
  in `../crosscheck.json`), `jsdom-only` (only the jsdom file) or `not-opened` (`reason` says why).
- `components/index.json`: environment and one row per component: status, number of scenarios, reason.
- `components/scenarios.json`: every scenario with `opened`, `error`, the document and the components it stands for.

Fields of a `via` entry (one scenario):

| Field | Meaning |
| --- | --- |
| `scenario`, `document` | scenario id and `folder:file` it ran on |
| `action` | `none`, `hover` (mouse moved to the center of the trigger), `click` (left click at its center), `focus` (`element.focus()`), `keys` (key presses) |
| `trigger.box` | `[x, y, width, height]` of the trigger element in CSS pixels, origin at the top left of the window content (the viewport), taken after the trigger was scrolled to the center of the viewport (`scrollIntoView({ block: 'center' })`, twice, 250 ms apart) and before the action |
| `trigger.skeleton` | the trigger's skeleton, cut at depth 3 (`cut` is the number of children that were left out) |
| `roots[]` | what the action showed: the open overlays (chip panel, popover, menu, dialog) or the element the scenario names |
| `roots[].box` | the same box for the root, measured 600 ms after the action |
| `roots[].title` | the first title text inside (panel header) |
| `roots[].skeleton` | the root's skeleton in the format above, cut at the scenario's depth (12 by default) |
| `roots[].style` | computed style values the scenario asked for (`opacity` of the frame chrome in each hover and focus state) |
| `roots[].markers` | how many panel parts (`PanelHeader`, `PanelRow`, ...) the root holds and the skeleton of the first |
| `foundInside` | the entry is a panel part found inside another scenario's root: `count` and `skeleton` are the part's own |

The skeleton drops what changes between runs: `pm-caret-hidden`, `data-key-context`, `data-side` and
`data-placement` (a popover opens above or below depending on the scroll), blob URLs and generated ids (`«id»`) and the
CodeMirror class counters (`\u037c«id»`). Everything else is as the editor draws it. The window is 1280x860 CSS pixels at
devicePixelRatio 1; the environment is in `components/index.json`.

Scenario notes a canvas test needs:

- Inline gears are `display: none` in the DOM editor. A code block, image, table, bare table, figure group and math
  block open their settings from the block handle: hover the block, then click the gutter button with that
  `aria-label` (`Code block settings`, `Image settings`, `Table settings`, `Figure settings`). `BlockHandle` is recorded
  with the hover of a paragraph and its gutters (`Insert block below`, `Drag to move` on the left, the block's gear and
  `Delete block` on the right).
- A frame chrome has `opacity: 0` at rest and `1` on hover of the frame and on focus of one of its buttons. The
  `FrameChrome` scenarios record every state the deck has: command form (`\frame{...}`, empty chrome), title slide (no
  add button), complete, subtitle missing, title missing (`Add title`) and the frame with `noframenumbering`.
- `IeeeAuthorView` and `BeamerColumnView` are plain DOM node views (not Svelte): their skeletons are the author preview
  inside the raw block and the `.beamer-column` and `.env-header` of the beamer block kinds.
- A `.drawn-chip` click opens `DrawnChipPanel` with the chip's settings component or, for a chip with none,
  `ChipSourceField` (title `LaTeX` or `Typst`). The title in `roots[].title` tells which opened.
- Math search opens with Tab in a focused math field. The reference picker opens with `@` typed in a paragraph (the
  scenario deletes it again).
- Clicking a reference or an `\include` chip opens another file or scrolls, so no overlay exists to record. Their
  skeletons are in `../crosscheck.json`.

Result of the last run (two runs on the same build gave the same 95 scenarios once generated ids were normalized): 82
components, 78 opened by a scenario and 4 (`RefDisplay`, `IncludeDocDisplay`, `BibliographyHeading`,
`TableWrapperComponent`) lying in a parity document and recorded in `crosscheck.json`. Every one of the 15 mounted
components and 49 settings, popover, panel and toolbar components of the audit has a file. Two scenarios record no
overlay by design (`body-ref-open`, `body-include-chip`: the click opens another file) and are listed in
`components/scenarios.json` with `opened: false`. `EnvironmentAlignSetting` opens only on a `center`, `flushleft` or
`flushright` environment, which `parity-tex-tables` holds and `parity-tex-body` does not. `CommentSettings` is recorded
on `parity-typ-drive:drawn.pristine.typ` because no other parity document has a comment in its body.

`FrameChrome` gained three jsdom states for the command form (`\frame{...}`): `command-form-missing-subtitle`,
`command-form-complete` and `command-form-title-slide`. The live check found that the command form draws the `Add title`
and `Add subtitle` buttons without a gear.

What the fixtures cannot hold: hover and focus are CSS (`opacity` of `.frame-chrome`), so the skeleton of a frame chrome
is the same in every state and the state is the `style.opacity` of its scenario (`0` at rest, `1` on hover and on
focus). Popover content that a component portals out (the frame settings card) is recorded as the open overlay root, and
its box is where Floating UI placed it at a window of 1280x860.
