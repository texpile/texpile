// W2's slice (20.2): clicks place the caret beside a chip and a formula, and an input method composes, in LaTeX, Typst
// and Markdown. P0's click rows on its sweep documents, and clicks a pixel beside every inline atom and a display formula,
// which the live DOM editor answered with the caret on that side (2026-11-17)
import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Selection } from 'prosemirror-state';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const KEYS = path.resolve(import.meta.dirname, '../../../fixtures/parity/keys');
const SWEEP = { tex: 'keys-sweep/sweep.tex', typ: 'keys-sweep/sweep.typ', md: 'keys-sweep/sweep.md' };
// rows that wait on another package's piece, by language and row
const WORD_UNDER_POINT = "M3: the double-click word is the one under the point by Chromium's rule, a space included";
const CHIP_PANEL = 'W11: the chip controller opens its panel and keeps the selection';
const AWAITING: Record<string, string> = {
	'tex single click on a chip': CHIP_PANEL,
	'tex double click on a chip': CHIP_PANEL,
	'typ single click on a chip': CHIP_PANEL,
	'typ double click on a chip': CHIP_PANEL,
	'tex double click on a punctuation mark': WORD_UNDER_POINT,
	'typ double click on a punctuation mark': WORD_UNDER_POINT,
	'md double click on a punctuation mark': WORD_UNDER_POINT,
	'md double click on the word after inline math': WORD_UNDER_POINT
};

type ClickRow = {
	id: string;
	clicks: number;
	mods: string[];
	before: [string, number, number];
	click: { pos: number; to: number | null; dx: number; dy: number };
	after: [string, number, number];
};
type ClickFixture = { environment: { window: [number, number] }; clicks: ClickRow[] };
type Atom = { pos: number; size: number; type: string; block: boolean; rect: { left: number; right: number; top: number; bottom: number } };

const texpile = useTexpile({
	files: Object.fromEntries(Object.values(SWEEP).map((rel) => [rel, fs.readFileSync(path.join(KEYS, rel), 'utf8')]))
});

function selectionNow(visual: VisualEditor): Promise<string> {
	return inCanvas(visual.page, ({ view }) => {
		const { selection } = view.state;
		const type = { text: 'text', node: 'node', gapcursor: 'gap', cell: 'cell', all: 'all' }[selection.toJSON().type as string];
		return `${type} ${selection.anchor} ${selection.head}`;
	});
}

/** sets a selection the way P0 did and puts `pos` 40% down the pane, as P0 scrolled before each click */
function place(visual: VisualEditor, before: [string, number, number], pos: number): Promise<void> {
	return inCanvas(
		visual.page,
		({ view }, { sel: [type, anchor, head], at }) => {
			let base = view.state.selection.constructor as typeof Selection;
			while (Object.getPrototypeOf(base).fromJSON) base = Object.getPrototypeOf(base);
			view.focus();
			view.dispatch(view.state.tr.setSelection(base.fromJSON(view.state.doc, type === 'node' ? { type, anchor } : { type, anchor, head })));
			const scroller = view.canvas.scroller;
			const box = scroller.getBoundingClientRect();
			scroller.scrollTop += view.coordsAtPos(at).top - (box.top + box.height * 0.4);
		},
		{ sel: before, at: pos }
	);
}

/** P0's click point: the glyph middle to `to`, a node's left edge plus dx at its middle, else the caret's x */
function clickPoint(visual: VisualEditor, click: ClickRow['click']): Promise<{ x: number; y: number }> {
	return inCanvas(
		visual.page,
		({ view, probe }, { pos, to, dx, dy }) => {
			const node = view.state.doc.nodeAt(pos);
			if (to === null && node && !node.isText) {
				const rect = probe.rectOfNode(pos)!;
				return { x: rect.left + dx, y: rect.top + rect.height / 2 + dy };
			}
			const a = view.coordsAtPos(pos, 1);
			const x = to === null ? a.left : (a.left + view.coordsAtPos(to, -1).left) / 2;
			return { x: x + dx, y: (a.top + a.bottom) / 2 + dy };
		},
		click
	);
}

/** inline atoms and display formulas with their client rects */
function atoms(visual: VisualEditor): Promise<Atom[]> {
	return inCanvas(visual.page, ({ view, probe }) => {
		const found: Atom[] = [];
		view.state.doc.descendants((node, pos) => {
			const inline = node.isInline && !node.isText && node.isAtom;
			if (!inline && !(node.isBlock && /math/.test(node.type.name))) return;
			const rect = probe.rectOfNode(pos)!;
			found.push({
				pos,
				size: node.nodeSize,
				type: node.type.name,
				block: !inline,
				rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
			});
		});
		return found;
	});
}

/** a single click a click counter cannot join to the last one */
async function clickAt(visual: VisualEditor, at: { x: number; y: number }): Promise<string> {
	await visual.page.waitForTimeout(520);
	await visual.page.mouse.click(at.x, at.y);
	await settled(visual.page);
	return selectionNow(visual);
}

for (const [language, rel] of Object.entries(SWEEP)) {
	test(`${language}: clicks place the caret beside a chip and a formula and an input method composes`, async () => {
		test.setTimeout(240_000);
		const fixture = JSON.parse(fs.readFileSync(path.join(KEYS, `pointer/pointer-docs.pointer.${language}.json`), 'utf8')) as ClickFixture;
		const { page, root } = texpile();
		const { app } = texpile();
		const [width, height] = fixture.environment.window;
		await app.evaluate(({ BrowserWindow }, [w, h]) => BrowserWindow.getAllWindows()[0].setContentSize(w, h), [width, height]);
		const visual = new VisualEditor(page, root);
		await visual.open(rel);
		await settled(page);
		const original = await visual.evalView<string>('return JSON.stringify(view.state.doc.toJSON());');

		const differ: string[] = [];
		for (const row of fixture.clicks.filter((each) => !AWAITING[`${language} ${each.id}`])) {
			await page.waitForTimeout(520);
			await place(visual, row.before, row.click.pos);
			await settled(page);
			const at = await clickPoint(visual, row.click);
			for (const mod of row.mods) await page.keyboard.down(mod);
			await page.mouse.click(at.x, at.y, { clickCount: row.clicks, delay: 20 });
			for (const mod of row.mods) await page.keyboard.up(mod);
			await settled(page);
			const got = await selectionNow(visual);
			if (got !== row.after.join(' ')) differ.push(`${row.id}: want ${row.after.join(' ')}, got ${got}`);
		}
		expect(differ, "P0's click rows").toEqual([]);

		const found = await atoms(visual);
		expect(found.filter((atom) => !atom.block).length, 'inline atoms beside which to click').toBeGreaterThan(1);
		for (const atom of found) {
			await place(visual, ['text', 1, 1], atom.pos);
			await settled(page);
			const [{ rect }] = (await atoms(visual)).filter((each) => each.pos === atom.pos);
			const y = (rect.top + rect.bottom) / 2;
			const end = atom.pos + atom.size;
			if (atom.block) {
				// the paragraph after the formula, as the DOM editor's caret went there
				const next = end + 1;
				expect(await clickAt(visual, { x: rect.left - 1, y }), `left of the ${atom.type} at ${atom.pos}`).toBe(`text ${next} ${next}`);
				expect(await clickAt(visual, { x: (rect.left + rect.right) / 2, y }), `on the ${atom.type}`).toBe(`node ${atom.pos} ${end}`);
				continue;
			}
			expect(await clickAt(visual, { x: rect.left - 1, y }), `before the ${atom.type} at ${atom.pos}`).toBe(`text ${atom.pos} ${atom.pos}`);
			expect(await clickAt(visual, { x: rect.right + 1, y }), `after the ${atom.type} at ${atom.pos}`).toBe(`text ${end} ${end}`);
		}

		// an input method composes beside the last inline formula
		const formula = found.filter((atom) => atom.type === 'inline_math').at(-1)!;
		await place(visual, ['text', 1, 1], formula.pos);
		await settled(page);
		const [{ rect }] = (await atoms(visual)).filter((each) => each.pos === formula.pos);
		const after = formula.pos + formula.size;
		expect(await clickAt(visual, { x: rect.right + 1, y: (rect.top + rect.bottom) / 2 })).toBe(`text ${after} ${after}`);
		expect(await inCanvas(page, ({ view }) => document.activeElement === view.dom), 'the root holds the focus (EditContext)').toBe(true);
		const textAfter = () => inCanvas(page, ({ view }, at) => view.state.doc.textBetween(at, at + 6), after);
		const cdp = await page.context().newCDPSession(page);
		for (const text of ['に', 'にほ', 'にほん'])
			await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
		await settled(page);
		expect(await textAfter(), 'the preedit is in the document').toMatch(/^にほん/);
		expect(await visual.evalView<boolean>('return view.composing;')).toBe(true);
		const underline = await inCanvas(
			page,
			({ view, probe }, at) => {
				const [start, end] = [view.coordsAtPos(at), view.coordsAtPos(at + 3)];
				const block = view.state.doc.resolve(at).before(1);
				return probe
					.drawList(block)
					.map((op) => ({ op: op.op, rect: view.canvas.clientRect(op.rect) }))
					.some(
						({ op, rect }) =>
							op === 'fillRect' &&
							rect.height <= 2.5 &&
							Math.abs(rect.left - start.left) < 1 &&
							Math.abs(rect.right - end.left) < 1 &&
							rect.top > start.top
					);
			},
			after
		);
		expect(underline, 'the preedit is underlined').toBe(true);
		await cdp.send('Input.insertText', { text: '日本' });
		await settled(page);
		expect(await textAfter(), 'the committed text replaces the preedit').toMatch(/^日本/);
		expect(await visual.evalView<boolean>('return view.composing;')).toBe(false);
		await page.keyboard.press('ControlOrMeta+z');
		await settled(page);
		expect(await visual.evalView<string>('return JSON.stringify(view.state.doc.toJSON());'), 'one undo takes the composition back').toBe(
			original
		);
		await cdp.detach();
		expect(await probeErrors(page)).toEqual([]);
	});
}
