import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { FIXTURE } from './driver/launch';
import { activeFile, hoverReading, insertAfter, lineOfCaret, openFile, withFile, type HoverReading } from './driver/cardHelpers';
import type { SourceEditor } from './driver/sourceEditor';
import { useTexpile } from './driver/useTexpile';

const PLOT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
// the chapter's figure exists, so opening the chapter does not ask the file server for a missing image
const RESULTS = fs.readFileSync(path.join(FIXTURE, 'chapters/results.tex'), 'utf8').replace('plot.png', 'plot.svg');
const texpile = useTexpile({ files: { 'figures/plot.svg': PLOT_SVG, 'chapters/results.tex': RESULTS } });

// the first time the chapter shows its figure the file server answers 403 for the candidate folder that has none
test.beforeAll(async () => {
	const { source, page, takeErrors } = texpile();
	await openFile(source, 'chapters/results.tex');
	await page.waitForTimeout(2500);
	await openFile(source, 'main.tex');
	takeErrors();
});

// what another file holds comes from the project scan, which a slow machine may not have finished; a card shown
// before it has nothing and stays so while the mouse stays, so hover again until it does
async function hoverInsertedUntil(file: string, text: string, anchor: string, offset: number, expected: string): Promise<HoverReading> {
	const { source } = texpile();
	return withFile(source, file, async () => {
		await insertAfter(source, file === 'main.tex' ? 'Speed is' : 'Body text.', text);
		let reading: HoverReading = { text: '', html: '' };
		await expect.poll(async () => (reading = await hoverReading(source, anchor, { offset })).text, { timeout: 15_000 }).toContain(expected);
		return reading;
	});
}

// the macros the document defines are read by a worker that starts with the first file
async function waitForMacroWorker(): Promise<void> {
	const { source, page } = texpile();
	await openFile(source, 'main.tex');
	await page.waitForTimeout(6000);
}

test.describe('hover cards', () => {
	test('a ref to a label in another file shows its context and the file', async () => {
		const h = await hoverInsertedUntil('main.tex', ' \\ref{fig:plot}', 'fig:plot', 3, 'A plot.');
		expect(h.text).toContain('\\caption{A plot.}');
		expect(h.text).toContain('results.tex');
	});
});

async function hintOf(source: SourceEditor): Promise<{ text: string; active: string[]; activeIndex: number }> {
	const { page } = source;
	return {
		text: await source.hint(),
		active: await page.locator('.cm-argument-hint-active').allInnerTexts(),
		activeIndex: await page
			.locator('.cm-argument-hint code > span')
			.evaluateAll((els) => els.findIndex((e) => e.classList.contains('cm-argument-hint-active')))
	};
}

/** the hint once it shows, or the empty hint */
async function shownHint(source: SourceEditor, timeout = 5000): Promise<Awaited<ReturnType<typeof hintOf>>> {
	await expect
		.poll(() => source.hint(), { timeout })
		.not.toBe('')
		.catch(() => {});
	return hintOf(source);
}

test.describe('argument hints', () => {
	test.beforeAll(waitForMacroWorker);

	test.afterEach(async () => {
		await texpile().source.press('Escape');
	});

	test('a package command shows all its arguments with the one being typed in bold', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await source.caretAfter('Speed is ');
			await source.type('\\marginnote{');
			const hint = await shownHint(source);
			expect(hint.text).toBe('\\marginnote[left text]{text}[vertical offset]');
			expect(hint.active).toEqual(['{text}']);
		});
	});
});

async function jumpFrom(source: SourceEditor, anchor: string): Promise<void> {
	await source.caretAfter(anchor);
	await source.page.waitForTimeout(500);
	await source.press('F12');
}

async function caretLineIs(source: SourceEditor, expected: string | RegExp): Promise<void> {
	await expect
		.poll(() => lineOfCaret(source), { timeout: 10_000 })
		.toMatch(expected instanceof RegExp ? expected : new RegExp(`^${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
}

async function fileIs(source: SourceEditor, name: string): Promise<void> {
	await expect.poll(async () => path.basename((await activeFile(source.page)) ?? ''), { timeout: 10_000 }).toBe(name);
}

test.describe('go to definition', () => {
	test('F12 on a ref jumps to a label in another file', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{fig:plot}');
			await jumpFrom(source, '\\ref{fig:pl');
			await fileIs(source, 'results.tex');
			await caretLineIs(source, /\\label\{fig:plot\}/);
		});
	});
});

test.describe('rename', () => {
	const files = ['main.tex', 'chapters/results.tex'];

	async function renameTo(source: SourceEditor, anchor: string, name: string): Promise<void> {
		const { page } = source;
		await source.caretAfter(anchor);
		await page.waitForTimeout(500);
		await source.press('F2');
		const input = page.locator('.cm-rename-card input');
		await expect(input).toBeVisible();
		await input.fill(name);
		await source.press('Enter');
		await expect(input).toHaveCount(0);
	}

	test.afterAll(async () => {
		// the rename went through the app, so a rename back is what puts every file as it was
		const { source } = texpile();
		await openFile(source, 'main.tex');
		for (const rel of files) {
			await expect
				.poll(() => fs.readFileSync(source.path(rel), 'utf8'), { message: `${rel} as the fixture had it`, timeout: 15_000 })
				.toBe(rel === 'chapters/results.tex' ? RESULTS : fs.readFileSync(path.join(FIXTURE, rel), 'utf8'));
		}
	});

	test('F2 on a ref renames the label in the other file too', async () => {
		const { source } = texpile();
		await withFile(source, 'main.tex', async () => {
			await insertAfter(source, 'Speed is', ' \\ref{fig:plot}');
			await renameTo(source, '\\ref{fig:pl', 'fig:chart');
			await expect.poll(() => source.text()).toContain('\\ref{fig:chart}');
			await expect
				.poll(() => fs.readFileSync(source.path('chapters/results.tex'), 'utf8'), { timeout: 15_000 })
				.toContain('\\label{fig:chart}');
			await renameTo(source, '\\ref{fig:ch', 'fig:plot');
			await expect
				.poll(() => fs.readFileSync(source.path('chapters/results.tex'), 'utf8'), { timeout: 15_000 })
				.toContain('\\label{fig:plot}');
		});
	});
});
