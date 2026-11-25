// the rules of the key groups the parity fixtures mark unstable (decisions/.../canvas/README.md): the DOM editor's rows depended on
// the browser's own state there, so the canvas follows one rule and this spec holds it
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { useTexpile } from '../driver/useTexpile';
import { VisualEditor } from '../driver/visualEditor';
import { settled } from './canvasPage';

const KEYS = path.resolve(import.meta.dirname, '../../fixtures/parity/keys');
const DOCS = process.env.TEXPILE_PARITY_DOCS ?? '/home/user/texpile-tools/perf-drive/work/docs';
const SWEEP = 'keys-sweep/sweep.tex';
const THEOREMS = 'parity-tex-theorems/main.tex';
const theoremsPath = path.join(DOCS, THEOREMS);

const files: Record<string, string> = { [SWEEP]: fs.readFileSync(path.join(KEYS, SWEEP), 'utf8') };
if (fs.existsSync(theoremsPath)) files[THEOREMS] = fs.readFileSync(theoremsPath, 'utf8');
const texpile = useTexpile({ files });

async function open(rel: string): Promise<VisualEditor> {
	const { page, root } = texpile();
	const v = new VisualEditor(page, root);
	await v.open(rel);
	await settled(page);
	return v;
}

async function select(v: VisualEditor, json: Record<string, unknown>): Promise<void> {
	await v.evalView(
		`let base = view.state.selection.constructor; while (Object.getPrototypeOf(base).fromJSON) base = Object.getPrototypeOf(base);
		view.focus(); view.dispatch(view.state.tr.setSelection(base.atStart(view.state.doc)));
		view.dispatch(view.state.tr.setSelection(base.fromJSON(view.state.doc, arg)).scrollIntoView()); return true;`,
		json
	);
}

async function where(v: VisualEditor): Promise<string> {
	return v.evalView<string>(
		`const s = view.state.selection; const type = { text: 'text', node: 'node', gapcursor: 'gap', cell: 'cell', all: 'all' }[s.toJSON().type]; return type + ' ' + s.anchor + ' ' + s.head;`
	);
}

test('a caret placed beside a display formula stays where it was placed, and every key starts from that place', async () => {
	const v = await open(SWEEP);
	const { page } = texpile();
	for (const [json, key, want] of [
		[{ type: 'text', anchor: 407, head: 407 }, 'ArrowLeft', 'text 406 406'],
		[{ type: 'text', anchor: 407, head: 407 }, 'ArrowRight', 'node 408 418'],
		[{ type: 'text', anchor: 407, head: 407 }, 'Shift+ArrowRight', 'text 407 419'],
		[{ type: 'text', anchor: 419, head: 419 }, 'ArrowLeft', 'node 408 418'],
		[{ type: 'text', anchor: 419, head: 419 }, 'ArrowRight', 'text 420 420'],
		[{ type: 'text', anchor: 419, head: 419 }, 'Shift+ArrowLeft', 'text 419 407']
	] as const) {
		await select(v, json);
		expect(await where(v), `set at ${json.anchor}`).toBe(`text ${json.anchor} ${json.head}`);
		await page.keyboard.press(key);
		expect(await where(v), `${key} from ${json.anchor}`).toBe(want);
	}
});

test('a Shift move from a selected node extends from the far edge of the node', async () => {
	const v = await open(SWEEP);
	const { page } = texpile();
	await select(v, { type: 'node', anchor: 348 });
	expect(await where(v)).toBe('node 348 358');
	await page.keyboard.press('Shift+ArrowRight');
	expect(await where(v), 'Shift+Right from the \\ref chip').toBe('text 348 359');
	await select(v, { type: 'node', anchor: 348 });
	await page.keyboard.press('Shift+ArrowLeft');
	expect(await where(v), 'Shift+Left from the \\ref chip').toBe('text 358 347');
	await select(v, { type: 'node', anchor: 348 });
	await page.keyboard.press('Shift+Control+ArrowRight');
	const word = (await where(v)).split(' ');
	expect([word[0], word[1]], 'Ctrl+Shift+Right keeps the anchor at the chip start').toEqual(['text', '348']);
	expect(Number(word[2])).toBeGreaterThan(358);
});

test('Shift+Down and Shift+Up from a display formula range over it, as from a selected block', async () => {
	const v = await open(SWEEP);
	const { page } = texpile();
	for (const [key, want] of [
		['Shift+ArrowDown', 'text 407 419'],
		['Shift+ArrowUp', 'text 419 407']
	] as const) {
		await select(v, { type: 'text', anchor: 407, head: 407 });
		await page.keyboard.press('ArrowRight');
		expect(await where(v)).toBe('node 408 418');
		await page.keyboard.press(key);
		expect(await where(v), `${key} from the formula`).toBe(want);
	}
	await page.keyboard.press('Shift+ArrowUp');
	const [kind, anchor, head] = (await where(v)).split(' ');
	expect([kind, anchor], 'the next Shift move keeps the anchor').toEqual(['text', '419']);
	expect(Number(head)).toBeLessThan(407);
});

test('Shift+Up and Shift+Down keep the goal column of the first vertical move', async () => {
	const v = await open(SWEEP);
	const { page } = texpile();
	// a caret late in a long line, then a short line (the heading's neighbour list) between: the column survives it
	await select(v, { type: 'text', anchor: 6 + 120, head: 6 + 120 });
	const column = await v.evalView<number>('return view.coordsAtPos(view.state.selection.head).left;');
	await page.keyboard.press('ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');
	await page.keyboard.press('Shift+ArrowDown');
	const after = await v.evalView<number>('return view.coordsAtPos(view.state.selection.head).left;');
	const head = (await where(v)).split(' ');
	expect(Number(head[1]), 'the anchor stays at the first vertical move').toBeGreaterThan(6 + 120);
	expect(Math.abs(after - column), 'the head aims at the column of the first Down').toBeLessThan(12);
	await page.keyboard.press('Shift+ArrowUp');
	await page.keyboard.press('Shift+ArrowUp');
	const back = await v.evalView<number>('return view.coordsAtPos(view.state.selection.head).left;');
	expect(Math.abs(back - column)).toBeLessThan(12);
});

type PageCase = {
	start: string;
	key: string;
	scrollerHeight: number;
	before: [string, number, number];
	after: [string, number, number];
	caretDocDy: number;
	caretPane: [number, number];
};

test.describe('the page keys follow the rule recorded in pointer/', () => {
	test.skip(!(THEOREMS in files), `no ${theoremsPath}`);
	const fixture = JSON.parse(fs.readFileSync(path.join(KEYS, 'pointer/parity-tex-theorems.main.tex.json'), 'utf8')) as {
		pageKeys: { cases: PageCase[] };
	};
	// the rows where P0's caret moved a regular step: the others met an end of the document or a tall block
	const regular = fixture.pageKeys.cases.filter(
		(c) => /^(PageDown|PageUp|Shift\+PageDown)$/.test(c.key) && Math.abs(c.caretDocDy / c.scrollerHeight) > 0.85
	);

	test('the caret moves 0.93 of the pane and lands at the top of the band, or at the foot with Shift', async () => {
		const v = await open(THEOREMS);
		const { page } = texpile();
		await page.setViewportSize({ width: 1009, height: 791 });
		await settled(page);
		expect(regular.length).toBeGreaterThan(5);
		const wrong: string[] = [];
		for (const c of regular) {
			await select(v, { type: 'text', anchor: c.before[1], head: c.before[2] });
			await v.evalView(
				`const rect = view.coordsAtPos(view.state.selection.head); view.canvas.scroller.scrollTop += rect.top - view.canvas.scroller.getBoundingClientRect().top - 0.4 * view.canvas.scroller.clientHeight; return true;`
			);
			await settled(page);
			const before = await v.evalView<{ y: number; h: number }>(
				'const r = view.coordsAtPos(view.state.selection.head); const s = view.canvas.scroller; return { y: r.top - s.getBoundingClientRect().top + s.scrollTop, h: s.clientHeight };'
			);
			await page.keyboard.press(c.key);
			await settled(page);
			// the band starts under the app's floating format bar, as P0 recorded it (caretPane about 45 in the app)
			const after = await v.evalView<{ y: number; pane: number; bottom: number; h: number; band: number }>(
				`const r = view.coordsAtPos(view.state.selection.head); const s = view.canvas.scroller; const top = s.getBoundingClientRect().top;
				const bar = view.dom.closest('.floating-bar-room')?.querySelector('[data-format-bar]')?.getBoundingClientRect();
				return { y: r.top - top + s.scrollTop, pane: r.top - top, bottom: r.bottom - top, h: s.clientHeight, band: bar ? bar.bottom - top : 0 };`
			);
			const step = (after.y - before.y) / before.h;
			const down = c.key.endsWith('PageDown');
			if (Math.abs(step - (down ? 0.93 : -0.93)) > 0.045) wrong.push(`${c.start} ${c.key}: caret moved ${step.toFixed(3)} of the pane`);
			else if (c.key.startsWith('Shift')) {
				if (Math.abs(after.bottom - (after.h - 5)) > 3) wrong.push(`${c.start} ${c.key}: caret foot at ${after.bottom} of ${after.h}`);
			} else if (Math.abs(after.pane - after.band - 5) > 2) wrong.push(`${c.start} ${c.key}: caret at ${after.pane} from the top`);
		}
		expect(wrong).toEqual([]);
	});
});
