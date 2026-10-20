import { expect, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import type { DiagnosticRow, SourceEditor } from './sourceEditor';

const CHECKS_SETTLE_MS = 1500;
const WORKSPACE = `(await import('/src/lib/workspace/workspaceStore.ts'))`;
const SWITCHES = `(await import('/src/lib/languages/latex/intellisense/checks/checkSwitches.ts'))`;

// each file as the folder first had it: its head tells the editor has swapped to it, the whole tells a test left it clean
const pristine = new Map<string, string>();

/** opens a file and waits until the editor shows it, not the file it replaced */
export async function openFile(source: SourceEditor, rel: string): Promise<void> {
	const file = source.path(rel);
	if (!pristine.has(file)) pristine.set(file, fs.readFileSync(file, 'utf8'));
	const shownAlready = ((await activeFile(source.page)) ?? '').endsWith(path.basename(rel));
	await source.open(rel);
	if (!shownAlready) {
		await expect
			.poll(() => source.evalView<string>('return view.state.doc.sliceString(0, 24);'), { message: `${rel} shown in the editor` })
			.toBe(pristine.get(file)!.slice(0, 24));
	}
	await source.page.waitForTimeout(400);
}

/** runs `body` on a file and puts the file back as it was, whatever the body did and wherever it navigated */
export async function withFile<T>(source: SourceEditor, rel: string, body: () => Promise<T>): Promise<T> {
	await openFile(source, rel);
	const before = await source.text();
	expect(before, `${rel} as the test found it`).toBe(pristine.get(source.path(rel)));
	try {
		return await body();
	} finally {
		await source.page.mouse.move(2, 2);
		await source.press('Escape');
		await openFile(source, rel);
		await source.restore(before);
		await source.page.waitForTimeout(300);
	}
}

/** the path of the file the workspace has open */
export function activeFile(page: Page): Promise<string | null> {
	return page.evaluate(async (w) => (await new Function(`return (async () => ${w})()`)()).activeFilePath.current, WORKSPACE);
}

/** puts `text` at the caret after the nth `anchor` in one insertion; the caret ends after it */
export async function insertAfter(source: SourceEditor, anchor: string, text: string, nth = 0): Promise<void> {
	await source.caretAfter(anchor, { nth });
	await source.evalView('view.dispatch(view.state.replaceSelection(arg));', text);
}

export function lineOfCaret(source: SourceEditor): Promise<string> {
	return source.evalView('return view.state.doc.lineAt(view.state.selection.main.head).text;');
}

/** the diagnostics once `match` holds for one, polled while the live checks catch up with the typing */
export async function waitForDiagnostic(
	source: SourceEditor,
	match: (d: DiagnosticRow) => boolean,
	message = 'a matching diagnostic'
): Promise<DiagnosticRow[]> {
	let rows: DiagnosticRow[] = [];
	await expect
		.poll(async () => (rows = await source.diagnostics()).some(match), { message, timeout: 20_000, intervals: [300, 500, 800, 1200] })
		.toBe(true);
	return rows;
}

/** the diagnostics after the live checks have had time to run on the text as it is */
export async function settledDiagnostics(source: SourceEditor, ms = 2500): Promise<DiagnosticRow[]> {
	await source.page.waitForTimeout(ms);
	return source.diagnostics();
}

export async function waitForNoDiagnostic(source: SourceEditor, match: (d: DiagnosticRow) => boolean, message: string): Promise<void> {
	await expect
		.poll(async () => (await source.diagnostics()).some(match), { message, timeout: 20_000, intervals: [300, 500, 800, 1200] })
		.toBe(false);
}

async function pointAt(source: SourceEditor, anchor: string, offset: number, nth: number): Promise<{ x: number; y: number }> {
	await source.page.mouse.move(2, 2);
	const pos = await source.evalView<number>(
		`const doc = view.state.doc.toString(); let at = -1;
		 for (let i = 0; i <= arg.nth; i++) { at = doc.indexOf(arg.anchor, at + 1); if (at < 0) return -1; }
		 const pos = at + arg.offset; view.dispatch({ effects: view.constructor.scrollIntoView(pos, { y: 'center' }) }); return pos;`,
		{ anchor, offset, nth }
	);
	expect(pos, `anchor ${JSON.stringify(anchor)} in the document`).toBeGreaterThanOrEqual(0);
	await source.page.waitForTimeout(250);
	const c = await source.evalView<{ x: number; y: number } | null>(
		'const c = view.coordsAtPos(arg); return c && { x: (c.left + c.right) / 2 + 2, y: (c.top + c.bottom) / 2 };',
		pos
	);
	expect(c, `coordinates of ${JSON.stringify(anchor)}`).not.toBeNull();
	return c!;
}

/** moves the mouse onto the character `offset` into the nth `anchor` and leaves it there */
export async function pointMouseAt(source: SourceEditor, anchor: string, offset = 2, nth = 0): Promise<void> {
	const c = await pointAt(source, anchor, offset, nth);
	await source.page.mouse.move(c.x - 40, c.y + 40);
	await source.page.mouse.move(c.x, c.y, { steps: 4 });
}

export type HoverReading = { text: string; html: string };

/** hovers like a reader and returns the hover tooltips as shown; the mouse stays when `keep` is set */
export async function hoverReading(
	source: SourceEditor,
	anchor: string,
	{ offset = 2, nth = 0, keep = false } = {}
): Promise<HoverReading> {
	const { page } = source;
	await pointMouseAt(source, anchor, offset, nth);
	const read = () =>
		page.evaluate(() => {
			const all = [...document.querySelectorAll('.cm-tooltip-hover')];
			return { text: all.map((t) => (t as HTMLElement).innerText).join(' | '), html: all.map((t) => t.innerHTML).join('') };
		});
	let reading: HoverReading = { text: '', html: '' };
	await expect
		.poll(async () => (reading = await read()).text || reading.html, { timeout: 4000 })
		.not.toBe('')
		.catch(() => {});
	if (!keep) await page.mouse.move(2, 2);
	return reading;
}

/** the diagnostic cards in the hover tooltip over the character `offset` into the nth `anchor`; the mouse stays on it */
export async function hoverCard(source: SourceEditor, anchor: string, { offset = 3, nth = 0 } = {}): Promise<Locator> {
	const cards = source.page.locator('.cm-tooltip-hover .card');
	// the checks read the packages again after the first pass, and setting diagnostics closes an open card
	for (let attempt = 0; attempt < 3; attempt++) {
		await source.page.waitForTimeout(CHECKS_SETTLE_MS);
		await pointMouseAt(source, anchor, offset, nth);
		await cards
			.first()
			.waitFor({ timeout: 5000 })
			.catch(() => {});
		await source.page.waitForTimeout(600);
		if (await cards.count()) break;
	}
	await expect(cards.first(), `a diagnostic card over ${JSON.stringify(anchor)}`).toBeVisible({ timeout: 5000 });
	return cards;
}

/** the gutter marker beside the line the nth `anchor` is on, hovered; returns the tooltip the marker opened */
export async function hoverGutterMarker(source: SourceEditor, anchor: string, nth = 0): Promise<Locator> {
	const { page } = source;
	await page.waitForTimeout(CHECKS_SETTLE_MS);
	const c = await pointAt(source, anchor, 1, nth);
	const marker = await page.evaluate((y) => {
		const hit = [...document.querySelectorAll('.cm-gutter-lint .cm-gutterElement')].find((el) => {
			const r = el.getBoundingClientRect();
			return el.querySelector('.cm-lint-marker') && r.top <= y && y <= r.bottom;
		});
		const r = hit?.querySelector('.cm-lint-marker')?.getBoundingClientRect();
		return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null;
	}, c.y);
	expect(marker, `a lint gutter marker on the line of ${JSON.stringify(anchor)}`).not.toBeNull();
	await page.mouse.move(marker!.x + 30, marker!.y + 30);
	await page.mouse.move(marker!.x, marker!.y, { steps: 4 });
	const tooltip = page.locator('.cm-tooltip-lint').filter({ has: page.locator('.card') });
	await expect(tooltip.first(), 'the gutter marker tooltip').toBeVisible({ timeout: 5000 });
	return tooltip;
}

export function moreActionsButton(card: Locator): Locator {
	return card.getByRole('button', { name: 'More actions' });
}

/** every live check back to its default, in the app and in the folder */
export async function resetChecks(page: Page): Promise<void> {
	await page.evaluate(async (s) => {
		const sw = await new Function(`return (async () => ${s})()`)();
		for (const id of sw.LATEX_CHECK_IDS) {
			sw.setLatexCheck(id, undefined);
			sw.setFolderCheck(id, undefined);
		}
	}, SWITCHES);
}

export function checkIsOn(page: Page, id: string): Promise<boolean> {
	return page.evaluate(async ({ s, id }) => (await new Function(`return (async () => ${s})()`)()).checkIsOn(id), { s: SWITCHES, id });
}

/** changes an app setting as Preferences does */
export async function updateSetting(page: Page, partial: Record<string, unknown>): Promise<void> {
	await page.evaluate(async (p) => (await import(/* @vite-ignore */ '/src/lib/settings.ts' as string)).updateSettings(p), partial);
}
