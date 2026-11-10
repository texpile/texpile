# Live mode

Checks for the live preview's engine, run without Electron. Both bundle the executor from `electron/src` with
esbuild on start, so there is no build step. Run from `apps/texpile-editor`.

```sh
node tests/live/teleport/check.mjs <folder> <main.tex> [--max=8] [--dense=1]
node tests/live/teleport/edits.mjs <folder> <main.tex> [--edits=12] [--seed=1]
```

`check.mjs` records a folder once, then teleports to the recorded points one at a time and compares every page each
teleport ships with the recording's own, record for record. `--dense=1` records a point at every clean line instead
of after each page. With `TELE_SELF=1`, each teleport also compares its whole state right after the apply with the
recorded one and prints the first difference.

`edits.mjs` is the gate for the app's path. It compiles the folder, then applies random prose edits (a word, a
sentence, a new paragraph, a deleted line) through the same executor the app calls. After each edit it compares the
pages on screen with a fresh run of the same text. It prints each edit's time to the first page and exits with 1
when any page differs.

`agent.mjs` is the same gate for the writes an agent makes: 2 to 5 hunks in one write (prose, math, lists, floats,
tables, headings, citations), writes to two or three files a moment apart, a write while a teleport or a compile still
runs, a half done write followed by the whole one, a write taken back but for its last hunk, and preamble changes. After each write it compares the screen with a
fresh run of what the app shows, and with a fresh run of disk once the app compiles. A write the app would never show
is reported as stale. `gate.mjs` holds what the two gates share, `agentHunks.mjs` the writes.

```sh
node tests/live/teleport/agent.mjs <folder> <main.tex> [--writes=8] [--seed=1] [--kinds=multi,files,overlap,compile,broken,revise,preamble]
```

Both gates take `--dump=<dir>`, where each wrong page goes as the page on screen and the fresh run's, and `--band`, which
runs the renderer's edit band code (`src/lib/draft/records/editBand.ts`) on the pages each shown edit shipped, as the
preview does, and checks that the band holds a line with the words the edit wrote (for a deletion, the words now in its
place). The summary then counts the bands that were right, on the wrong line or page, missing, or in the known limits
(`bandOracle.mjs`); a band off its edit goes to the dump folder as `band-<n>.json`.

`fixtures/` holds the documents both run on; unit tests read some of them too. Copies go to the OS temp folder, so
the fixtures are never edited.
