# Source editor performance on very large files

Status: audited and largely fixed (2026-07-27). The original notes here claimed three things; a
code audit (every claim verified against the code, worst offenders benchmarked at 1MB) confirmed
all three and pinpointed the causes.

## What was actually happening (1MB `.tex`, source mode)

1. **Intellisense ran a full parse per completion.** Typing `\` (or backspacing near a macro,
   which force-reactivates completion) ran a full unified-latex AST parse of the entire buffer
   **synchronously on the main thread** — measured 7–8 s at 1MB
   (`intellisense/completion/macros.ts`). This was the dominant freeze.
2. **Whole-copy churn per keystroke.** Beyond the expected copies (CM's rope, `texSource`,
   `diskBaseline`), extensions materialized fresh full-document strings constantly: the fold
   gutter built one **per visible `\begin` line** per keystroke/scroll (`fold.ts`), the starter
   ghost one **per transaction** (`starterGhost.ts`), math-preview scanned the whole doc per
   keystroke even with the preview disabled (`mathPreview.ts`), and a redundant diagnostics
   re-anchor dispatched an extra CM transaction per keystroke that re-ran every extension
   (`SourceEditor.svelte`). Draft mode added ~5 full-document line-splits per keystroke
   (`draft/dispatch.ts`).
3. **Spell check re-linted the entire document.** Every 500 ms pause shipped the whole masked
   source to the harper worker: ~30 s per run at 1MB (super-linear), no cancellation (runs piled
   up), stale results applied to a changed doc, and each arrival blocked the main thread ~0.4 s
   hydrating tens of thousands of lints through wasm (`cmSpellcheck.ts`, `harper/linter.ts`).

## What was fixed

- `src/lib/editor/docText.ts` — WeakMap-cached `Text` → string: at most **one** full
  materialization per document version, shared by every consumer; text-keyed caches now hit on a
  reference compare.
- User-macro scan moved to a worker (`completion/userMacroScan.ts` + `userMacros.worker.ts` +
  `userMacrosClient.ts`), stale-while-revalidate with a 300 ms debounce; completion/hover never
  parse on the main thread (sync fallback only where `Worker` doesn't exist, e.g. vitest).
- Fold gutter: shared string, 100k-char scan cap, `\begin{document}` skipped, section walk is
  O(distance) (`fold.ts`).
- Starter ghost: length short-circuit, never materializes a non-trivial doc (`starterGhost.ts`).
- Math preview: lazy + incremental region scan, skipped entirely while disabled
  (`mathPreview.ts`).
- Diagnostics: the per-keystroke `setDiagnostics` dispatch is skipped when nothing changed
  (`SourceEditor.svelte`); completion reactivation on delete is gated by a line-local trigger
  check (`intellisense.ts`); search-panel recount debounced (`searchPanel.ts`); word count is a
  single zero-allocation scan (`countStore.svelte.ts`).
- Spell check: incremental **paragraph-level** linting with a text-keyed cache — only edited
  paragraphs re-lint, batched in ≤20k-char chunks a fresh edit can supersede; in-flight runs are
  cancelled on doc change (gen bump) and single-flighted; harper lints as plaintext instead of
  Markdown; masked-string build and lint hydration de-quadraticized (`cmSpellcheck.ts`,
  `texMask.ts`, `harper/linter.ts`).
- Draft mode: baseline split/parse memoized, diff shares line arrays — 22.9 ms → 9.7 ms per
  keystroke decision at 1MB (`draft/dispatch.ts`).
- Earlier same-day fixes: label/`\bibitem` extraction to a worker (was a synchronous ~9 s parse
  per 400 ms typing pause), debounced source outline/counts, byte-capped cross-mode undo history.

## Still known / accepted

- The `updateListener` still materializes one full string per keystroke (via `docText`, so it is
  the single shared copy) to feed `texSource` — removing it entirely means reworking the
  save/collab pipeline around CM's rope, not worth it yet.
- First spell-check pass on a cold 1MB file still lints everything (in supersedable chunks).
- Buffer-defined macro completions can lag an edit by ~300 ms + parse time (worker refresh).
- Visual mode: a 1MB file exceeds the parser worker's 3 s timeout and falls back to source mode;
  preamble/macro-scan memoization in the parser is the next lever for that.
