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

type DraftEvent = { kind: string; detail?: Record<string, unknown>; t?: number };
function events(page: Page): Promise<DraftEvent[]> {
	return page.evaluate(() => (window as unknown as { __draftEvents?: DraftEvent[] }).__draftEvents ?? []);
}

/** a teleport after `from` (performance.now) whose detail passes `hit` */
function teleported(page: Page, from: number, hit: (detail: Record<string, unknown>) => boolean): () => Promise<boolean> {
	return async () => (await events(page)).some((e) => e.kind === 'teleport' && (e.t ?? 0) > from && hit(e.detail ?? {}));
}

test.skip(!hasLualatex(), 'needs lualatex');

test('an edit in live mode ships its page from the engine', async () => {
	const { page, source } = texpile();
	await source.open('main.tex');
	// the preview compiles once when it opens
	await page.getByRole('button', { name: 'Show PDF' }).click();
	// the wait before the first pages lists the compile's steps, which the engine's process reports
	await expect(page.getByText('Typesetting the paper')).toBeVisible({ timeout: 60_000 });
	await expect.poll(async () => (await events(page)).some((e) => e.kind === 'compiled'), { timeout: 120_000 }).toBe(true);
	await expect(page.getByText('Typesetting the paper')).toHaveCount(0);
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

// the float took the rest of the document with it, and the preview dropped the pages TeX never shipped
test('a float left open holds the pages until it closes', async () => {
	const { page, source } = texpile();
	await source.open('main.tex');
	// the test before this one leaves the preview open
	const show = page.getByRole('button', { name: 'Show PDF' });
	if (await show.count()) await show.click();
	await expect.poll(async () => (await events(page)).some((e) => e.kind === 'compiled'), { timeout: 120_000 }).toBe(true);
	const insertAfter = (anchor: string, text: string): Promise<void> =>
		source.evalView(
			'const at = view.state.doc.toString().indexOf(arg.anchor) + arg.anchor.length; view.dispatch({ changes: { from: at, insert: arg.text } });',
			{ anchor, text }
		);
	let from = await page.evaluate(() => performance.now());
	await insertAfter('after the first one.', '\n\n\\begin{figure}\nA float.');
	await expect
		.poll(
			teleported(page, from, (d) => d.reason === 'open'),
			{ timeout: 60_000 }
		)
		.toBe(true);
	await expect(page.locator('[data-resize-cover] canvas')).toHaveCount(1);
	from = await page.evaluate(() => performance.now());
	await insertAfter('A float.', '\n\\end{figure}');
	await expect
		.poll(
			teleported(page, from, (d) => d.ok === true && d.from === 1),
			{ timeout: 60_000 }
		)
		.toBe(true);
});

// a title half typed prints nothing, and the pane went from a page to nothing and back on every key
test('a document left without text keeps its page while typing, then says what the preview needs', async () => {
	const { page, source } = texpile();
	await source.open('main.tex');
	const show = page.getByRole('button', { name: 'Show PDF' });
	if (await show.count()) await show.click();
	await expect.poll(async () => (await events(page)).some((e) => e.kind === 'compiled'), { timeout: 120_000 }).toBe(true);
	const from = await page.evaluate(() => performance.now());
	await source.evalView(
		`const doc = view.state.doc.toString(); const a = doc.indexOf('\\\\begin{document}') + 16; view.dispatch({ changes: { from: a, to: doc.indexOf('\\\\end{document}'), insert: '\\n' } });`
	);
	await expect
		.poll(
			teleported(page, from, (d) => d.ok === true && d.count === 0),
			{ timeout: 60_000 }
		)
		.toBe(true);
	await expect(page.locator('[data-resize-cover] canvas')).toHaveCount(1);
	await expect(page.getByText('The preview needs some text in the document.')).toBeVisible({ timeout: 60_000 });
});
