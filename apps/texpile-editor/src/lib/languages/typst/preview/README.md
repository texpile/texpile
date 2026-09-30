# Typst live preview

tinymist's incremental preview, rendered in a Texpile pane instead of a browser frame.

Everything the feature needs is in this folder:

| file                  | what it is                                                  |
| --------------------- | ----------------------------------------------------------- |
| `protocol.ts`         | the data plane wire format, decoded. Pure functions, no DOM |
| `session.ts`          | the websocket + the wasm render session, producing SVG      |
| `TypstPreview.svelte` | the pane: toolbar, scroller, theming                        |

Tests live at `tests/unit/typst/previewProtocol.test.ts`.

## How it works

1. The renderer asks the **language server** to start a preview, through
   `tinymist.doStartPreview` (see `../lspClient.ts`). The reply carries a `dataPlanePort`.
2. The pane opens a websocket to `ws://127.0.0.1:<dataPlanePort>` and sends `current`.
3. tinymist streams its **vector document format** - `new` for a whole document, `diff-v1` for an
   update. Each frame is `<kind-ascii>,<payload-bytes>`, split on the first comma, with the payload
   left as raw bytes.
4. The payload is merged into a wasm render session, which renders the document to SVG.

## Why it needs no save

Because nothing here reads the file. A standalone `tinymist preview` watches the filesystem, so it
can only ever show _saved_ text. Started through the language server instead, the preview renders
the server's **in-memory** document, which both editors keep current with `textDocument/didChange`:
the source editor through its LSP plugin, the visual editor through `TypstDocumentStream`
(`../intellisense/typstDocumentStream.ts`), which sends the text it serializes to once typing pauses
for 200ms. Without that stream the visual editor left the server reading the disk: an autosave
behind, plus the file watcher's ~1.5s.

Both hold the same open document (`../intellisense/typstWorkspace.ts`), so a mode switch hands it
from one to the other without closing it, and its versions keep climbing.

Measured against tinymist 0.15: an in-memory edit produced a new `diff-v1` frame **6-20ms** later,
with the file on disk untouched. The only timers in the path are the editors' sync debounces.

While a preview is attached, `WorkspaceView` skips the debounced `runTypstLive` recompile entirely;
that fallback only exists for when this pane is not showing.

## Why a pane and not a frame

tinymist also serves a ready-made preview page, and pointing an iframe at it would have been a
two-line feature. The renderer sets `frame-src 'none'` on purpose (see `electron/src/main.ts`), so
that route costs a real hole in the CSP. This route costs nothing: a websocket to loopback is
already inside `connect-src`, and `wasm-unsafe-eval` is already in `script-src`. No new main-process
surface, no extra window, no CSP change.

It is also the only way the document gets _our_ colours, _our_ scrollbars and _our_ toolbar.

The SVG is injected with `{@html}`, so the renderer is asked for `body`/`defs`/`css` and explicitly
**not** for its `js` payload, which it would otherwise include by default.

## Provenance

Ported from tinymist's own preview frontend
([`tools/typst-preview-frontend`](https://github.com/Myriad-Dreamin/tinymist), Apache-2.0) - the wire
format, the frame kinds, the nearest-page jump rule and the dark-page filter all come from reading
that code.

It is a port, not a copy. Their frontend carries `typst-dom`, a bespoke incremental DOM patcher
(~110KB of TypeScript, unpublished, repo-local). This re-renders the SVG and lets the browser diff
the result, which is a fraction of the code for output that is the same. The trade is that a very
large document re-serialises where theirs would patch in place; if that ever shows up in practice,
`RenderSession.renderSvgDiff()` is the incremental door.

Runtime dependencies, both Apache-2.0 and both loaded lazily so a LaTeX project never pays for them:

- `@myriaddreamin/typst-ts-renderer` - 1.22MB wasm, emitted as its own asset and fetched by URL
- `@myriaddreamin/typst.ts` - the JS around it; ~23KB reaches the bundle after tree-shaking

Both are pinned to `0.8.0-rc3`, the version tinymist itself pins. The vector format is versioned
along with the renderer, so this pin should move when tinymist's does, not independently.
