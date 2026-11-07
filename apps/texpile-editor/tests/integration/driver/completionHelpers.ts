import { expect } from '@playwright/test';
import fs from 'node:fs';
import { SourceEditor, type CompletionRow } from './sourceEditor';

/** one typed probe: open `file`, put the caret after `anchor`, type `typed` */
export type Probe = {
	file: string;
	anchor: string;
	typed: string;
};

export const labels = (rows: CompletionRow[]): string[] => rows.map((r) => r.label);

/** opens the file and waits until the editor holds it: the view of the file before can still be mounted just after open() */
export async function openFile(source: SourceEditor, rel: string): Promise<void> {
	await source.open(rel);
	const head = fs.readFileSync(source.path(rel), 'utf8').slice(0, 40);
	await expect.poll(async () => (await source.text()).slice(0, 40), { timeout: 8000 }).toBe(head);
}

// the label list follows the text on a debounce, so a label just put in is not there to complete for a moment
async function waitForLabels(source: SourceEditor): Promise<void> {
	await expect
		.poll(
			() =>
				source.page.evaluate(async () => {
					const store = '/src/lib/stores/editorStore.ts';
					const { labelStore, sourceCmView } = await import(/* @vite-ignore */ store);
					const text = sourceCmView.current.state.doc.toString().replace(/(^|[^\\])%.*$/gm, '$1');
					const found = [...new Set([...text.matchAll(/\\label\{([^}]*)\}/g)].map((m) => m[1]))].sort();
					return JSON.stringify(found) === JSON.stringify([...labelStore.current].sort());
				}),
			{ timeout: 4000 }
		)
		.toBe(true)
		.catch(() => {});
}

async function place(source: SourceEditor, p: Probe): Promise<void> {
	await source.caretAfter(p.anchor);
	await waitForLabels(source);
}

/** the list once it stops changing; an empty list is given time to open */
async function settle(source: SourceEditor): Promise<CompletionRow[]> {
	const started = Date.now();
	let rows: CompletionRow[] = [];
	let last = '';
	let still = 0;
	while (Date.now() - started < 9000) {
		await source.page.waitForTimeout(250);
		rows = await source.completions();
		const now = JSON.stringify(rows);
		still = now === last ? still + 1 : 0;
		last = now;
		if (still >= (rows.length ? 4 : 9)) return rows;
	}
	return rows;
}

/** types the probe and returns the settled list; the text is put back after */
export async function probe(source: SourceEditor, p: Probe): Promise<CompletionRow[]> {
	await openFile(source, p.file);
	const before = await source.text();
	try {
		await place(source, p);
		await source.type(p.typed);
		return await settle(source);
	} finally {
		await source.press('Escape');
		await source.restore(before);
	}
}

export type Accepted = {
	/** the whole document after the key */
	text: string;
	/** the line holding the caret, with a | where the caret is */
	line: string;
	caret: number;
	rows: CompletionRow[];
};

/** types the probe, takes row `pick` (a label or the selected one) with `key`, reads the result; the text is put back after */
export async function acceptCompletion(source: SourceEditor, p: Probe, { pick }: { pick?: string } = {}): Promise<Accepted> {
	await openFile(source, p.file);
	const before = await source.text();
	try {
		await place(source, p);
		await source.type(p.typed);
		const rows = await settle(source);
		expect(rows.length, `a list to accept from after typing ${p.typed}`).toBeGreaterThan(0);
		if (pick !== undefined) {
			const at = labels(rows).indexOf(pick);
			expect(at, `${pick} in ${JSON.stringify(labels(rows).slice(0, 12))}`).toBeGreaterThanOrEqual(0);
			const selected = await source.page.evaluate(() =>
				[...document.querySelectorAll('.cm-tooltip-autocomplete li')].findIndex((li) => li.getAttribute('aria-selected') === 'true')
			);
			for (let i = 0; i < at - Math.max(selected, 0); i++) await source.press('ArrowDown');
		}
		await source.press('Enter');
		await source.page.waitForTimeout(500);
		return await source
			.evalView<Omit<Accepted, 'rows'>>(
				`const head = view.state.selection.main.head; const line = view.state.doc.lineAt(head);
			 return { text: view.state.doc.toString(), caret: head,
			   line: line.text.slice(0, head - line.from) + '|' + line.text.slice(head - line.from) };`
			)
			.then((r) => ({ ...r, rows }));
	} finally {
		await source.press('Escape');
		await source.restore(before);
	}
}
