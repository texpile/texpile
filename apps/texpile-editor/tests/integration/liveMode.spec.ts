import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import type { Page } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';

// Live mode runs the lualatex on PATH; without one the spec is skipped
function hasLualatex(): boolean {
	try {
		execFileSync(process.platform === 'win32' ? 'where' : 'which', ['lualatex']);
		return true;
	} catch {
		return false;
	}
}

const MAIN = String.raw`\documentclass{article}
\usepackage{graphicx}
\begin{document}
\section{Speed}
Speed is a quantity with a direction, and this paragraph is long enough to wrap onto a second line of the page.

A second paragraph keeps the page going after the first one.

\rotatebox{20}{A drawing}
\end{document}
`;

const texpile = useTexpile({
	files: { 'main.tex': MAIN, '.texpile/config.json': JSON.stringify({ v: 1, main: 'main.tex', latex: { liveMode: true } }) }
});

type DraftEvent = { kind: string; detail?: Record<string, unknown> };
function events(page: Page): Promise<DraftEvent[]> {
	return page.evaluate(() => (window as unknown as { __draftEvents?: DraftEvent[] }).__draftEvents ?? []);
}

test.skip(!hasLualatex(), 'needs lualatex');

test('an edit in live mode ships its page from the engine', async () => {
	const { page, source } = texpile();
	await source.open('main.tex');
	// the preview compiles once when it opens
	await page.getByRole('button', { name: 'Show PDF' }).click();
	await expect.poll(async () => (await events(page)).some((e) => e.kind === 'compiled'), { timeout: 120_000 }).toBe(true);
	await source.caretAfter('Speed is ');
	await source.type('fast ');
	await expect
		.poll(async () => (await events(page)).some((e) => e.kind === 'teleport' && e.detail?.ok === true && e.detail.from === 1), {
			timeout: 60_000
		})
		.toBe(true);
	// the page the engine shipped is not in the compile's PDF, which still has its drawing
	await expect
		.poll(async () =>
			(await events(page)).some((e) => e.kind === 'drawings' && e.detail?.page === 1 && e.detail.fromPdf === 1 && e.detail.unmatched === 0)
		)
		.toBe(true);
});
