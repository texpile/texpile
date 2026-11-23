# VERIFY answers

`verify.json` answers every VERIFY item of design 18.2 and every VERIFY marker of `INV/*.md` (the inventory folder holds
them in `codemirror-bridge.md` and its summary in `digest.md`).

## verify.json

```
{ environment, inventoryMarkers: [{ file, line, item }], items: [Item] }
Item = { id, covers: string[], question, answer, evidence: { method, script?, code?: string[], screenshots?: string[],
         measurements?, grep?, file?, notRecorded? } }
```

- `covers` names the design 18.2 item or the `inventory/<file>.md:<line>` marker the item settles.
- `evidence.code` lists `file:line` in the DOM editor's source (`apps/texpile-editor/...`, at the commit in
  `environment.domEditorCommit`).
- `evidence.measurements` holds the numbers the answer quotes. The full set is `measurements.json`.
- `evidence.screenshots` are PNG files in this folder.
- `inventoryMarkers` maps each marker (file and line in the inventory) to the item that answers it.

Items: `codeBlockFontSize`, `readOnlyInIsland`, `disabledGearStyle`, `peerCaretsInIslands`, `defaultKeymap`,
`indentUnitAndTabSize`, `scrollerBorder`, `wrappedChipOutline`, `tabInChip`, `pageViewDarkSheet`, `typRefMissingRule`,
`templateBlockRuleDead`, `noautofocusConsumer`, `rawLatexLangAttr`, `integrationSpecsVisualOrSource`.

## Other files

- `defaultKeymap.json`: `@codemirror/commands` `defaultKeymap`, `standardKeymap` and `@codemirror/autocomplete`
  `completionKeymap` as rows `{ key, mac, win, linux, run, shift, scope, preventDefault }`. `run` and `shift` are the
  exported command names. `onlyInDefault` lists the rows `defaultKeymap` has beyond `standardKeymap`. `Mod` is Ctrl on
  Windows and Linux and Cmd on macOS.
- `measurements.json`: every number measured. Lengths are CSS pixels at devicePixelRatio 1 in a 1280x860 window, zoom 1.
  Rect fields are `getBoundingClientRect` values in viewport coordinates.
- `*.png`: screenshots. `wrapped-chip-focused`, `code-block`, `raw-block-focused` and `typ-ref` are captured with
  `Page.captureScreenshot` clips at 3x, 2x, 2x and 4x. The page view shots are 1x.

## Documents and method

Purpose made documents (`perf-drive/parity/verify/docs/` in texpile-tools): a LaTeX file with a two-line inline chip, a
`lstlisting` code block and `verbatim`, a Markdown file with a fenced code block and an HTML block (the raw block), and a
Typst file with a raw block and a broken `@ref`. Each run works on a copy because the app saves in place.

Measurements read the live editor through `globalThis.__p0.editorViewStore.current` (ProseMirror) and CodeMirror's
`cmTile.view` on `.cm-content`. Dark mode and page view were switched the way the app does it (`data-mode`, the `dark`
class on `html`, the `page-view` class on the editor).

## Not recorded

- Peer carets with a real second participant: a session needs a relay and a second window, neither runs in this
  container. A peer was fed through the remote cursor plugin's own channel instead (see `peerCaretsInIslands`).
- Read-only editing and the disabled gear were produced by making the editor non-editable (`setProps({ editable })`) and
  setting `disabled` on the gear, because the offline app never has a viewer.
- macOS and Windows: only Linux was measured. The 13px fixed font size, the 3px border, the tab size and the keymap rows
  are platform independent in the code. The code block font size is the engine's default fixed size per platform and
  needs a macOS and Windows row from Louis's machines (pending).
