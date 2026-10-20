import { expect } from '@playwright/test';
import fs from 'node:fs';
import { SourceEditor, type CompletionRow } from './sourceEditor';

/** one typed probe: open `file`, put the caret after `anchor` (dropping `replace` after it), type `typed` */
export type Probe = {
	file: string;
	anchor: string;
	typed: string;
	/** text after the anchor that the probe overwrites */
	replace?: string;
	nth?: number;
	/** Ctrl+Space after typing */
	explicit?: boolean;
	/** text put in after `anchor` before the caret goes there, without typing it */
	edit?: { anchor: string; insert: string };
	/** text put in at the caret without typing it, so no completion opens for it */
	insert?: string;
	/** ms between keystrokes, 40 by default */
	delay?: number;
	/** Backspace presses after typing */
	backspaces?: number;
};

/** a probe and what its list must show; a label can be matched exactly (`has`) or by its start (`hasPrefix`) */
export type Case = Probe & {
	name: string;
	has?: string[];
	hasPrefix?: string[];
	lacks?: string[];
	lacksPrefix?: string[];
	lacksRe?: RegExp[];
	/** the first row starts with this */
	first?: string;
	/** no list at all */
	none?: boolean;
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
	if (p.edit) {
		await source.caretAfter(p.edit.anchor);
		await source.evalView('view.dispatch(view.state.replaceSelection(arg));', p.edit.insert);
	}
	await source.caretAfter(p.anchor, { nth: p.nth, replace: p.replace?.length ?? 0 });
	if (p.insert) await source.evalView('view.dispatch(view.state.replaceSelection(arg));', p.insert);
	await waitForLabels(source);
}

/** the list once `ready` holds, else once it stops changing; an empty list is given time to open */
async function settle(source: SourceEditor, ready?: (rows: CompletionRow[]) => boolean): Promise<CompletionRow[]> {
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
		if (ready?.(rows)) {
			if (still >= 2) return rows;
			continue;
		}
		if (!ready && still >= (rows.length ? 4 : 9)) return rows;
	}
	return rows;
}

/** types the probe and returns the settled list; the text is put back after */
export async function probe(source: SourceEditor, p: Probe, ready?: (rows: CompletionRow[]) => boolean): Promise<CompletionRow[]> {
	await openFile(source, p.file);
	const before = await source.text();
	try {
		await place(source, p);
		await source.type(p.typed, p.delay);
		for (let i = 0; i < (p.backspaces ?? 0); i++) await source.press('Backspace');
		if (p.explicit) await source.press('Control+Space');
		return await settle(source, ready);
	} finally {
		await source.press('Escape');
		await source.restore(before);
	}
}

export async function checkCase(source: SourceEditor, c: Case): Promise<CompletionRow[]> {
	const wanted = (seen: string[]) =>
		(c.has ?? []).every((l) => seen.includes(l)) &&
		(c.hasPrefix ?? []).every((p) => seen.some((l) => l.startsWith(p))) &&
		(c.first === undefined || seen[0]?.startsWith(c.first) === true);
	const positive = c.has || c.hasPrefix || c.first !== undefined;
	const rows = await probe(source, c, positive ? (r) => wanted(labels(r)) : undefined);
	const seen = labels(rows);
	const shown = `list: ${JSON.stringify(seen.slice(0, 12))}`;
	for (const l of c.has ?? []) expect(seen, `${l} offered. ${shown}`).toContain(l);
	for (const p of c.hasPrefix ?? [])
		expect(
			seen.some((l) => l.startsWith(p)),
			`a label starting ${p}. ${shown}`
		).toBe(true);
	for (const l of c.lacks ?? []) expect(seen, `${l} not offered. ${shown}`).not.toContain(l);
	for (const re of c.lacksRe ?? [])
		expect(
			seen.filter((l) => re.test(l)),
			`nothing matching ${re}. ${shown}`
		).toEqual([]);
	for (const p of c.lacksPrefix ?? [])
		expect(
			seen.some((l) => l.startsWith(p)),
			`no label starting ${p}. ${shown}`
		).toBe(false);
	if (c.first !== undefined)
		expect(seen[0] ?? '', `first row. ${shown}`).toMatch(new RegExp('^' + c.first.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
	if (c.none) expect(seen, `no list. ${shown}`).toEqual([]);
	return rows;
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
export async function acceptCompletion(
	source: SourceEditor,
	p: Probe,
	{ pick, key = 'Enter', follow }: { pick?: string; key?: string; follow?: () => Promise<void> } = {}
): Promise<Accepted> {
	await openFile(source, p.file);
	const before = await source.text();
	try {
		await place(source, p);
		await source.type(p.typed, p.delay);
		for (let i = 0; i < (p.backspaces ?? 0); i++) await source.press('Backspace');
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
		await source.press(key);
		await source.page.waitForTimeout(500);
		await follow?.();
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

/** the caret line starts as given, for a probe placed mid-line */
export function expectLineStart(r: Accepted, expected: string): void {
	expect(r.line.startsWith(expected), `the caret line ${JSON.stringify(r.line)} starts ${JSON.stringify(expected)}`).toBe(true);
}
