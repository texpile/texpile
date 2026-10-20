# App tests

These tests drive the real app. Each spec file opens an Electron window on the Vite dev server with its own copy of
`fixture/` and a fresh profile, then types, clicks and hovers like a user would. A test fails when the app shows
something wrong, writes the wrong bytes to disk, or logs a page or console error.

## Run them

From `apps/texpile-editor`:

```sh
pnpm test:integration                                   # every spec
pnpm test:integration tests/integration/rename.spec.ts  # one spec
pnpm test:integration -g "argument hint"                # tests whose name matches
```

On Linux without a display, put `xvfb-run -a` in front. `savePackageFile.spec.ts` drafts a package file with TeX: it uses
the `lualatex` on PATH, or the folder in `TEXPILE_TEST_TEX_BIN`, and skips its tests when neither has one. The run builds `electron/dist` first and starts Vite on port 5191,
so a `pnpm electron:dev` on 5173 can stay open. A failed test leaves a screenshot of the window in `report/`
(`npx playwright show-report tests/integration/report`).

CI runs the whole suite on every push (`.github/workflows/test.yml`, job `app`), and `release.yml` waits for it.

## Write one

```ts
import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';

const texpile = useTexpile({ files: { 'extra.tex': '\\documentclass{article}\n' } });

test('booktabs commands complete', async () => {
	const { source } = texpile();
	await source.open('main.tex');
	const rows = await source.completeAfter('\\label{sec:intro}\n', '\\topr');
	expect(rows.map((r) => r.label)).toContain('\\toprule');
});
```

- `useTexpile` opens one window for the spec file. Tests in a file run in order and share it, so a test puts back the
  text it changed (`source.restore`, or `completeAfter`, which does it itself).
- Place the caret with `source.caretAfter(anchor)`, then type with the keyboard. Read what the user sees: the completion
  list, the hover card, the argument hint, the lint ranges, the file on disk.
- Extra files go through `useTexpile({ files })`. `fixture/` stays as it is.
