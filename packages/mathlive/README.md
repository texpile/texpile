# mathlive (Texpile fork)

[MathLive](https://github.com/arnog/mathlive) 0.110.0 (tag `v0.110.0`), vendored as the workspace package `mathlive` so the
editor's imports stay `from 'mathlive'`. MIT licensed, see `LICENSE.txt`.

Upstream's `src/` and `css/` are copied unchanged apart from the fork's own edits, and keep upstream's formatting so the
two still diff cleanly. `src/api.md` and the Vue wrapper are left out. The fork's additions live in `src/typst/`: reading
and writing Typst math (`read/`, `write.ts`), and typing it in a field whose `syntax` is `typst` (`input/`).
`src/addons/math-commands.ts` lists everything an equation can hold in either syntax, for `getMathCommands()`.

`pnpm install` builds `dist/` through the `sync` script (`scripts/build.mjs`, which stands in for upstream's `build.sh`):
the browser and node bundles, the stylesheets, the fonts and the type declarations. Run `pnpm --filter mathlive build`
after changing the source.
