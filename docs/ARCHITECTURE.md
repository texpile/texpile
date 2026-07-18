# Live mode architecture

Live mode is a live LaTeX preview that updates as you type, running on the TeX installation
the user already has (LuaTeX only). It has two speeds: a low-level instant path that redraws the
edited paragraph in tens of milliseconds, and a high-level background compile that restores
whole-document truth. We ship only text (`.lua`, `.tex`, JavaScript); no engine, no binaries. If
the engine can't support the instant path, the app falls back to on-demand compilation and works
as it did before.

## Is this incremental compile?

No, this is not incremental compile. We are merely separating the instant path from the slow path
and rendering the instant part immediately.

For most document edits, a LaTeX compile is mostly fixed cost. Roughly 70% of the time is just
starting the process, loading the format, and loading the preamble and fonts, then writing the
PDF. The typesetting itself is computationally cheap and near instant. Our goal is simply to
render the instant path immediately while compiling the non-instant part in the background, so the
preview feels instant. As far as my investigation of LuaTeX goes, true incremental compile like
Typst is impossible here, so we do not attempt it.

## Keeping the engine warm

`electron/src/draft-daemon.ts` starts the user's `lualatex` once, loads the document's
preamble, and holds it open with a Lua loop (`electron/lua/texd-loop.lua`). From the engine's
view it's an ordinary compile that never reaches `\end{document}`. The app sends one block of
LaTeX over stdin; the engine typesets just that block and reports the result. Costs paid once,
not per edit: process/format load, and preamble/fonts (the daemon is keyed by a sha1 of the
preamble; editing body text reuses it, editing `\usepackage` lines respawns it in ~1s).

Lifecycle: the Lua loop exits on stdin EOF, so if the app dies (even a hard kill) the OS
closes the pipe and the daemon reaps itself within a second; no orphaned engines. An idle
daemon also stops after 10 minutes unused and re-warms on the next edit.

Getting the picture out without a PDF: a valid PDF requires the engine to finish and write its
index, which a held-open engine never does. So the instant path uses no PDF. After LuaTeX
typesets a block, it holds the result as a **node list**: the exact internal layout ("glyph
'T' from font X at (x,y), then a kern, then a rule here"). `electron/lua/walker.lua` traverses
that list and streams compact JSONL records (font, glyph, rule, image, with positions and
colors). `renderCore.ts` draws those records onto a canvas using the same font files the
engine used, read from the user's TeX tree. Because the outlines come from the same fonts at
the engine's coordinates, a drawn glyph is the shape the PDF would contain. No layout logic
runs app-side; every hard decision was already made by the engine.

Units: node dimensions are TeX points (1/72.27 in); PDF and CSS points are 1/72 in. The walker
emits TeX points; the renderer applies one scale, `px_per_pt = DPI / 72.27`. Mixing 72 and
72.27 shifts everything 0.375% and was an early bug.

Protocol (stdin -> stdout): `HSIZE n` / `GLYPHS` / `TEXT`..`END` in; `texpile-warm@@CAP`
(capabilities), `texpile-warm@@READY hsize textheight`, `texpile-warm@@R` (per-block stats),
`@@G` (one glyph), `texpile-warm@@GEND` out. Frame markers carry the app prefix so TeX log
chatter (which can contain bare `@@`, e.g. `\@@par` in error contexts) can't imitate them;
the per-glyph `@@G` lines stay short because thousands stream per request and they are only
read between `R` and `GEND`. Blocks are flattened to one line before sending so a line equal
to a protocol sentinel can't confuse the framing.

## Deciding patch vs recompile

The `WorkspaceView` live-mode `$effect` watches `texSource` (the single source of truth that both
the visual and source editors write to) and decides per edit. It is not a general text diff:
`splitParas()` cuts both the last-compiled source and the current source into an ordered list
of paragraphs (blank lines, comment lines, and block commands like `\section`/`\begin`/`\item`
are boundaries), then compares **by index**. The fast path is taken only when the two lists
have equal length and exactly one paragraph's text differs, i.e. a pure in-place single
paragraph edit. Any insert, delete, or multi-paragraph change shifts or changes the count and
falls back to a debounced full recompile. This is O(n), runs every keystroke, and is
conservative: ambiguous cases recompile.

Two guards sit after the diff picks a paragraph:

- **Balance guard** (`daemonReady`): while you're mid-command the text is transiently
  unbalanced (`\textbf{` before the `}`). An open brace group has no paragraph terminator, so
  the daemon would block its full timeout and get killed. The guard skips the patch until
  braces and inline `$` are balanced, holding the last preview.
- **Mathematically-exact failsafe**: the patch applies only when a real recompile would
  provably produce the same page; otherwise it abandons and recompiles immediately. Checks:
  the paragraph must not span pages or columns; the daemon re-typesetting the _unedited_
  paragraph must reproduce the page band exactly (line count, baselines), which empirically
  verifies fonts/size/macros; the column's natural glue must match (no flushbottom stretch);
  the height delta must fit the remaining column slack. A false positive would silently draw a
  wrong layout, so the predicate is conservative and a miss only costs a recompile.

## Certify or route

The walker also certifies each block. A block using only constructs we fully draw (prose,
math, lists, tables, headings, colors, images-by-geometry) renders live. A block containing
raw PDF drawing (`pdf_literal`, how TikZ draws), right-to-left text, or anything unknown is
**uncertified**: editing it routes to the background compile, updating in about a second
instead of instantly. The failure mode is "the figure updates a beat later", which degrades
visibly, not "we drew the figure wrong", which fails silently.

On the page canvas the drawing itself still shows: the walker emits the sized box containing
the literals as a `lit` region record (position + dimensions, contents not walked), and the
renderer paints that rect as pixels cropped from the background compile's PDF for the same edit
(pdf.js, cached per compile). So a pgfplots axis, a TikZ diagram, or a `\rotatebox` renders
exactly, from the last compile's ink. Ink drawn outside the box bounds (TikZ `overlay`) is the
one thing a rect crop can't carry; degenerate 0x0 picture boxes fall through to the plain
walk so they only flag the page, same as before.

## The background compile

`electron/src/draft-service.ts` runs a plain full compile with the user's engine on a debounce
and on save. It is the authority for reference/citation values, true page geometry, and
uncertified-block pixels. It is latexmk-lite: `seedBbl` before pass 1, then `auxCycle` runs
biber (only when the `.bcf` hash changed) or bibtex, then the classic extra passes when the
`.bbl`/aux changed. `page-extract.lua` writes `_draft/pages.json` + `page-NNN.jsonl` per
shipout (per-shipout, not at end-document, so the final page isn't dropped). `exportDaemonRefs`
writes the resolved `\newlabel`/`\bibcite` to `_draft/live-refs.tex` so `\ref`/`\cite` resolve
on the instant path too.

**Cancel-on-supersede**: a compile shells out with a 120s kill timeout, but a genuinely hung
document (infinite macro, malformed construct) would otherwise stick the preview for the full
120s. So each new compile SIGKILLs the previous run's `lualatex` (`compileGen`/`activeChild`)
and the renderer drops the stale result by token. A hung compile is killed within ~20ms of the
next edit instead of blocking.

## Pagination

The instant layer does not reproduce TeX's whole-document page breaking. Each page is its own
canvas at the real paper size, with the content box at the real margins, and a page break is just
a canvas boundary. Blocks arrive in document order with known
heights; the paginator assigns each a `(page, yOffset)`. A block straddling the page edge
splits at line boundaries (records are per-line, so it's client-side arithmetic). Per-page
canvases are also forced by browser canvas size caps and bound edit reflow (only the edited
page and later pages re-layout); viewport virtualization makes document length irrelevant.
Page dimensions are read from the engine's resolved registers at warm-up
(`tex.dimen["columnwidth"]` for the live measure, not `textwidth`, which isn't the constraining
width under `twocolumn`), never parsed from preamble text.

## The exact-PDF resting view

At rest the preview paints each visible page from a pdf.js raster of `_draft/draft.pdf` -- the
reconcile compile's own output, so the resting view is pixel-exact by construction (true fonts,
figures, tikz). The record canvas remains the LIVE layer: while typing, patches composite over
the raster (wipe the column band, strip-shift the base below it by delta, overlay the daemon's
records), and the record render is the interim state before a page's raster lands and the
permanent fallback when a document error truncates the PDF (records ship per page regardless).
Rasters are cached per (page, scale), capped near 400dpi, and invalidated per compile.

Viewport windowing keeps this bounded: only visible pages +-2 hold a raster or a painted
canvas (`cv.width = 0` frees the rest; their CSS boxes preserve scroll geometry). Patch
targets and navigation destinations force-paint before scrolling.

More record-space anchors from the engine, never heuristics: the shipout box baseline (`ht` in
the manifest) IS the footer baseline, and `\footskip` above it is the body bottom -- capacity
checks measure against that, and nothing below it ever shifts with a patch (footers are
bottom-anchored). Cross-page paragraph straddles and column-bottom overflows render as split
patches (band A ends its column, the remainder opens the next page's first column), always
provisional. Beamer frames are transparent to the splitter (`frame` is a non-block env), so
slide content patches like ordinary prose; frame structure recompiles. Footnote bodies are
walked as separate `note` record groups (`ins` nodes), letting the patch prove a footnote
unchanged and stay exact.

## The no-engine constraint

We ship only text and use the user's TeX, which drives several decisions:

- **Engine variance**: node type and subtype IDs differ across LuaTeX versions, so the walker
  resolves every ID by name at startup, never by number. A capability probe (`texpile-warm@@CAP`) reports
  version and required APIs at warm-up; if it fails, live preview turns off and the app
  compiles on demand as before. Live preview is an enhancement, never a dependency.
- **Preview vs output engine**: the instant path is always `lualatex`; the user's final build
  may use `pdflatex`. Metrics differ slightly, which is acceptable because the background compile
  runs _their_ command for authoritative output.
- **Classic Type1 fonts**: the renderer parses the real `.pfb` with the vendored pdf.js
  Type1 parser (`apps/texpile-editor/src/lib/draft/type1/`) and draws its actual outlines,
  size variants and delimiter pieces included. `electron/src/font-t1map.ts` resolves each
  font record to its `.pfb` + reencoding `.enc` via the user's own `pdftex.map`, so the ink
  and the encoding both come from the installation that typeset the page. Unresolvable
  fonts (PFA, PK bitmaps) draw nothing rather than guess.
- **pdfTeX primitives**: many arXiv preambles set `\pdfoutput=1` unguarded, which LuaTeX
  lacks. Both the compile and the daemon prepend `\ifdefined\pdfoutput\else\newcount\pdfoutput\fi`
  so the assignment is a harmless no-op.
- **First run**: we can't ship a font database into the user's install, but the first
  background compile triggers the engine to build its own, with a one-time "preparing fonts"
  state.

## File map

| Concern                                                                | File                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Warm daemon manager (spawn, preamble hash, per-block typeset, timeout) | `electron/src/draft-daemon.ts`                                             |
| Daemon Lua loop + capability probe + record streaming                  | `electron/lua/texd-loop.lua`                                               |
| Node-list walker (glyphs, rules, images, color, certification)         | `electron/lua/walker.lua`                                                  |
| Background full compile + aux cycle + cancel-on-supersede              | `electron/src/draft-service.ts`                                            |
| Full-compile page extraction (per-shipout manifest)                    | `electron/lua/page-extract.lua`                                            |
| Type1 font name -> { .pfb, .enc } resolution (pdftex.map)              | `electron/src/font-t1map.ts`                                               |
| Type1 parsing + charstring -> canvas paths (vendored pdf.js)           | `apps/texpile-editor/src/lib/draft/type1/`                                 |
| Records -> canvas draw ops                                             | `apps/texpile-editor/src/lib/draft/renderCore.ts`                          |
| Canvas galley, instant patch, failsafe, pagination, zoom               | `apps/texpile-editor/src/lib/draft/DraftView.svelte`                       |
| Patch-vs-recompile diff, balance guard, patch dispatch                 | `apps/texpile-editor/src/views/WorkspaceView.svelte` (live-mode `$effect`) |
| Bridge types (`DraftResult`, `ParagraphResult`)                        | `apps/texpile-editor/src/lib/workspace/fileSystem.ts`                      |
| IPC handlers (`draft:compile`/`typeset`/`stop`) + preload bridge       | `electron/src/main.ts`, `electron/src/preload.ts`                          |

## Appendix: the drawable vocabulary

Coverage is finite, not an endless chase of packages, because packages live in the macro layer
and can only reach us as nodes. However exotic a package is, by shipout its output is composed
from the engine's fixed set of node types plus a fixed set of whatsit annotations. Every
package runs unmodified inside the real daemon; we read the resulting nodes, we do not emulate
the package. Customization changes node _values_ (positions, fonts, colors), never node
_types_. So the walker is a painter for the engine's output language, audited against the
engine's own PDF writer (`hlist_out`/`vlist_out`).

The 11 node types the PDF writer dispatches on, and our handling:

| node        | what it is             | handling                                                                                                         |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| glyph       | one character          | draw its outline from the same font file                                                                         |
| kern        | fixed spacing          | advance cursor (scaled by expansion for font kerns)                                                              |
| glue        | stretchable space      | advance by `node.effective_glue`; rule leaders tiled                                                             |
| rule        | filled rectangle       | emit rect; resolve RUNNING dims against the enclosing box                                                        |
| hlist       | horizontal box         | recurse with shift; image-bearing boxes emit one image record; literal-bearing sized boxes emit one `lit` region |
| vlist       | vertical box           | recurse vertically                                                                                               |
| disc        | hyphenation point      | walk its visible material                                                                                        |
| margin_kern | protrusion (microtype) | advance cursor                                                                                                   |
| math        | inline-math boundary   | advance by mathsurround/mathskip                                                                                 |
| dir         | direction change (RTL) | uncertifies the block; routes to the background compile                                                          |
| whatsit     | backend annotation     | by subtype, below                                                                                                |

Whatsit subtypes: `pdf_colorstack` is tracked as a real stack and resolved to a hex color per
record (done). `pdf_literal` and the transform trio `pdf_save`/`pdf_restore`/`pdf_setmatrix`
(`\rotatebox`) are raw drawing: the sized box holding them becomes a `lit` region rendered as
a background-compile PDF crop, and any block containing them stays uncertified for editing.
`late_lua`/`special` can't be proven invisible either and uncertify without a region. Links,
annotations, position capture, and `\write` (the cross-reference channel, the background
compile's job) are invisible on the page canvas and ignored. The engine's own writer ignores
unrecognized subtypes, so "ignore safely" is engine-sanctioned.
