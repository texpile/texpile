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

`fixtures/` holds the documents both run on; unit tests read some of them too. Copies go to the OS temp folder, so
the fixtures are never edited.
