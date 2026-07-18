# Live-mode edit-class matrix

The acceptance oracle for the instant-preview ceiling campaign, running WITHOUT Electron:
the real `DraftView` is mounted in headless Chromium (vite dev serves the source), the real
engine modules (`draft-service`, `draft-daemon`, synctex) sit behind a small HTTP bridge
(`server.mjs`), and the real decision layer (`$lib/draft/dispatch`) classifies each edit.

Per scenario the driver applies a pure string edit to the fixture buffer, runs
`decideEdit(baseline, edited)`, dispatches the result through the component's actual
`instantPatch`/`provisionalInsert`/`provisionalDelete`, and classifies `__draftEvents`:

- `EXACT` - instant patch, provably identical to a recompile
- `PROV` - instant tinted provisional patch, reconcile converges at pause
- `RECOMPILE` - the edit fell back to a full pass
- `TRANSIENT`/`HOLD` - mid-typing repaired render / held preview (unbalanced input)
- `NOOP` - render-identical edit, correctly ignored
- `NOFEEDBACK` - nothing happened (a bug unless the scenario is a deliberate no-op)

Run (from `apps/texpile-editor`; needs `pnpm electron:build` for the bridge modules, the
renderer is served from source so it needs no build):

```sh
node tests/live/matrix.mjs                 # full matrix
node tests/live/matrix.mjs --only=basic    # one fixture
node tests/live/matrix.mjs --only=basic:prose-short
```

Results land in `results/matrix-<stamp>.md` with an at-ceiling score. Fixture copies live
in the OS temp dir per run; the repo fixtures are never edited. After each scenario the
edited buffer is written to disk and recompiled so the next scenario starts from a clean
baseline. Headless: no window, no keyboard-focus stealing.
