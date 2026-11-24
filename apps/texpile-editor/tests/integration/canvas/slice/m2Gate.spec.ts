// the M2 gate (design 20.2): the slice documents in docs/ driven as a writer drives them, read through the probe. Numbers
// and list markers drawn, a save without an edit byte for byte, keys across the chip, formula and table as the DOM editor
// answered them (canvas/p0-dom, 3 tries each, 2026-11-18), clicks beside the chip and the formula, an input method, copy
// and paste, the raw block typed into, a comment tint and a peer caret, and every edit undone back to the file's bytes
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import { Disk } from '../../driver/disk';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';
import { GATE_CASES, type GateStart } from './m2GateCases';

const DOCS = path.resolve(import.meta.dirname, 'docs');
// the LaTeX slice is the folder's main file, as it is in docs/, so the paper numbers it
const texpile = useTexpile({
	files: {
		...Object.fromEntries(GATE_CASES.map((c) => [c.file, fs.readFileSync(path.join(DOCS, c.file), 'utf8')])),
		'.texpile/config.json': JSON.stringify({ v: 1, main: 'slice-tex/main.tex' })
	}
});

/** the start's position and the selection as the rows write it, the same code the DOM recording ran */
const PAGE_HELPERS = `window.__m2 = {
	startPos(view, start) {
		let found = -1;
		view.state.doc.descendants((node, pos) => {
			if (found >= 0 || !node.isText) return found < 0;
			if (start.cellText !== undefined) {
				if (node.text === start.cellText) found = pos + (start.end ? node.text.length : 0);
				return found < 0;
			}
			const i = node.text.indexOf(start.needle);
			if (i >= 0) found = pos + i + (start.end ? start.needle.length : 0);
			return found < 0;
		});
		return found;
	},
	selection(view) {
		const s = view.state.selection;
		return (s.node ? 'node' : s.$anchorCell ? 'cell' : s.visible === false ? 'gap' : 'text') + ' ' + s.anchor + ' ' + s.head;
	},
	place(view, start) {
		view.focus();
		const pos = this.startPos(view, start);
		let base = view.state.selection.constructor;
		while (Object.getPrototypeOf(base.prototype) !== Object.prototype) base = Object.getPrototypeOf(base.prototype).constructor;
		view.dispatch(view.state.tr.setSelection(base.near(view.state.doc.resolve(pos))));
		return this.selection(view);
	}
};`;

type GateWindow = {
	__m2: {
		selection(view: unknown): string;
		place(view: unknown, start: GateStart): string;
		startPos(view: unknown, start: GateStart): number;
	};
};

function selectionNow(page: Page): Promise<string> {
	return inCanvas(page, ({ view }) => (window as unknown as GateWindow).__m2.selection(view));
}

function place(page: Page, start: GateStart): Promise<string> {
	return inCanvas(page, ({ view }, start) => (window as unknown as GateWindow).__m2.place(view, start), start);
}

function docJson(page: Page): Promise<string> {
	return inCanvas(page, ({ view }) => JSON.stringify(view.state.doc.toJSON()));
}

/** undoes until the document is the one given, at most `most` times */
async function undoBackTo(page: Page, json: string, most = 4): Promise<void> {
	for (let i = 0; i < most && (await docJson(page)) !== json; i++) {
		await page.keyboard.press('ControlOrMeta+z');
		await settled(page);
	}
	expect(await docJson(page), 'undo gives the document back').toBe(json);
}

/** the text the frame drew in the top-level block holding `pos` */
function drawnTexts(page: Page, pos: number): Promise<string[]> {
	return inCanvas(
		page,
		({ probe, view }, pos) =>
			probe
				.drawList(view.state.doc.resolve(pos).before(1))
				.filter((op) => op.op === 'fillText')
				.map((op) => op.text!),
		pos
	);
}

function writeClipboard(app: ElectronApplication, text: string, html: string): Promise<void> {
	return app.evaluate(
		async ({ clipboard, ClipboardItem }, written) => {
			await clipboard.write([new ClipboardItem({ 'text/plain': written.text, 'text/html': written.html })]);
		},
		{ text, html }
	);
}

function readClipboard(app: ElectronApplication): Promise<{ text: string; html: string }> {
	return app.evaluate(async ({ clipboard }) => {
		const [item] = await clipboard.read();
		const read = async (type: string) => (item?.types.includes(type) ? ((await item.getType(type)) as Blob).text() : '');
		return { text: await read('text/plain'), html: await read('text/html') };
	});
}

/** rect: null for a chip drawn as its source, which has no box of its own yet */
type InlineAtom = { pos: number; size: number; type: string; rect: { left: number; right: number; top: number; bottom: number } | null };

/** the formula and drawn chips of the paragraph holding `needle`, with their rects */
function inlineAtoms(page: Page, needle: string): Promise<InlineAtom[]> {
	return inCanvas(
		page,
		({ probe, view }, needle) => {
			const at = probe.posOf(needle);
			const $at = view.state.doc.resolve(at);
			const start = $at.start();
			const found: InlineAtom[] = [];
			$at.parent.forEach((node, offset) => {
				if (node.isText) return;
				const rect = probe.rectOfNode(start + offset);
				found.push({
					pos: start + offset,
					size: node.nodeSize,
					type: node.type.name,
					rect: rect && { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }
				});
			});
			return found;
		},
		needle
	);
}

for (const c of GATE_CASES)
	test(`${c.file}: the slice as a writer uses it`, async () => {
		test.setTimeout(300_000);
		const { page, app, root } = texpile();
		const visual = new VisualEditor(page, root);
		const disk = new Disk(root);
		const original = disk.readBytes(c.file);
		await visual.open(c.file);
		await settled(page);
		await page.evaluate(PAGE_HELPERS);
		const json = await docJson(page);

		await page.keyboard.press('ControlOrMeta+s');
		await disk.expectUnchanged(c.file, original.toString('utf8'));
		expect(disk.readBytes(c.file).equals(original), 'a save without an edit writes the file byte for byte').toBe(true);

		// numbers and markers
		const heading = await inCanvas(page, ({ probe }, title) => probe.posOf(title), 'The slice');
		expect(await drawnTexts(page, heading), 'the heading').toEqual([...c.numbers.heading, 'The', ' ', 'slice']);
		if (c.numbers.heading.length) {
			// a section put in before it renumbers the heading: the drawn number follows its attribute
			await inCanvas(
				page,
				({ probe, view }, title) => {
					const at = view.state.doc.resolve(probe.posOf(title)).before(1);
					const heading = view.state.doc.nodeAt(at)!;
					view.dispatch(view.state.tr.insert(at, heading.type.create(heading.attrs, view.state.schema.text('Inserted'))));
				},
				'The slice'
			);
			await settled(page);
			const renumbered = await inCanvas(page, ({ probe }, title) => probe.posOf(title), 'The slice');
			expect(await drawnTexts(page, renumbered), 'the heading renumbered').toEqual([...c.numbers.next, 'The', ' ', 'slice']);
			await undoBackTo(page, json);
		}
		const display = await inCanvas(page, ({ view }) => {
			let found = -1;
			view.state.doc.forEach((node, offset) => {
				if (found < 0 && node.type.name === 'block_math') found = offset + 1;
			});
			return found;
		});
		const displayTexts = await drawnTexts(page, display);
		if (c.numbers.equation) expect(displayTexts, 'the equation number').toContain(c.numbers.equation);
		else expect(displayTexts.filter((text) => /^\(\d+\)$/.test(text))).toEqual([]);
		const markers = await inCanvas(page, ({ probe, view }) => {
			const item = probe.posOf('First point');
			const text = probe.rectOf(item)!;
			return (
				probe
					.drawList(view.state.doc.resolve(item).before(1))
					// the label the listNumbers decoration gives, drawn as text before the item, as the DOM editor's marker
					.filter((op) => op.op === 'fillText' && /^[\u2022\u25e6\u25aa\u2013*-]\s*$/.test(op.text ?? ''))
					.map((op) => view.canvas.clientRect(op.rect))
					.filter((rect) => rect.left < text.left && rect.bottom > text.top && rect.top < text.bottom)
			);
		});
		expect(markers, 'a bullet before the first item').toHaveLength(1);

		// keys across the chip, the formula and the table
		const differ: string[] = [];
		for (const walk of c.walks) {
			await page.keyboard.press('Escape');
			const rows = [`start ${await place(page, walk.start)}`];
			await settled(page);
			for (const key of walk.keys) {
				await page.keyboard.press(key);
				await settled(page);
				rows.push(`${key} ${await selectionNow(page)}`);
			}
			const want = walk.rows.map((row, i) => walk.canvas?.[i] ?? row);
			if (walk.why) test.info().annotations.push({ type: `${c.file} ${walk.id}`, description: walk.why });
			if (JSON.stringify(rows) !== JSON.stringify(want)) differ.push(`${walk.id}: want ${want.join(', ')}; got ${rows.join(', ')}`);
		}
		expect.soft(differ, "the DOM editor's rows").toEqual([]);

		// clicks 1 px beside the drawn chip and the formula
		const atoms = await inlineAtoms(page, c.paragraph);
		expect(atoms.map((atom) => atom.type)).toEqual(c.atoms);
		for (const atom of atoms.filter((each) => each.type !== 'inline_latex' || c.drawnChip)) {
			const rect = atom.rect!;
			const y = (rect.top + rect.bottom) / 2;
			await page.waitForTimeout(520);
			await page.mouse.click(rect.left - 1, y);
			await settled(page);
			expect(await selectionNow(page), `1 px left of the ${atom.type}`).toBe(`text ${atom.pos} ${atom.pos}`);
			await page.waitForTimeout(520);
			await page.mouse.click(rect.right + 1, y);
			await settled(page);
			expect(await selectionNow(page), `1 px right of the ${atom.type}`).toBe(`text ${atom.pos + atom.size} ${atom.pos + atom.size}`);
		}

		// typing after the formula and an input method composing there, each taken back by undo
		const formula = atoms.find((atom) => atom.type === 'inline_math')!;
		const after = formula.pos + formula.size;
		const textAfter = () => inCanvas(page, ({ view }, at) => view.state.doc.textBetween(at, at + 6), after);
		await page.keyboard.type('xyz');
		await settled(page);
		expect(await textAfter()).toMatch(/^xyz /);
		expect(await drawnTexts(page, after)).toContain('xyz');
		await undoBackTo(page, json);
		await page.waitForTimeout(520);
		const formulaRect = formula.rect!;
		await page.mouse.click(formulaRect.right + 1, (formulaRect.top + formulaRect.bottom) / 2);
		await settled(page);
		const cdp = await page.context().newCDPSession(page);
		for (const text of ['に', 'にほ', 'にほん'])
			await cdp.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
		await settled(page);
		expect(await textAfter(), 'the preedit is in the document').toMatch(/^にほん/);
		await cdp.send('Input.insertText', { text: '日本' });
		await settled(page);
		expect(await textAfter(), 'the committed text').toMatch(/^日本 /);
		await cdp.detach();
		await undoBackTo(page, json, 1);

		// the paragraph holding the chip and the formula copied and pasted after the last paragraph
		const word = await inCanvas(page, ({ probe }, needle) => probe.clientPointOf(probe.posOf(needle) + 3), c.paragraph);
		await page.waitForTimeout(520);
		await page.mouse.click(word.x, word.y, { clickCount: 3 });
		await settled(page);
		await page.keyboard.press('ControlOrMeta+c');
		const copied = await readClipboard(app);
		expect(copied.text).toBe(c.copiedLine);
		const paragraphJson = () =>
			inCanvas(
				page,
				({ view }, needle) => {
					const found: string[] = [];
					view.state.doc.forEach((node) => {
						if (node.textContent.includes(needle))
							found.push(JSON.stringify(node.content.toJSON(), (key, value) => (key === 'orig' ? undefined : value)));
					});
					return found;
				},
				c.paragraph
			);
		const [copiedJson] = await paragraphJson();
		await page.keyboard.press('ControlOrMeta+End');
		await page.keyboard.press('Enter');
		await writeClipboard(app, copied.text, copied.html);
		await page.keyboard.press('ControlOrMeta+v');
		await settled(page);
		expect(await paragraphJson(), 'the pasted paragraph is the copied one').toEqual([copiedJson, copiedJson]);
		await undoBackTo(page, json);

		// Tab through the table typing in each cell
		await place(page, { cellText: 'a', end: true });
		for (const key of ['T:1', 'Tab', 'T:2', 'Tab', 'T:3', 'Tab', 'T:4']) {
			if (key.startsWith('T:')) await page.keyboard.type(key.slice(2));
			else await page.keyboard.press(key);
		}
		await settled(page);
		const cells = await inCanvas(page, ({ probe }) => probe.query('td, th').map((cell) => cell.text));
		expect(cells.slice(0, 4)).toEqual(['a1', '2', '3', '4']);
		await undoBackTo(page, json, 8);

		// the raw block typed into, drawn in its colors
		await place(page, c.raw.start);
		await page.keyboard.type(c.raw.typed);
		await settled(page);
		expect(await inCanvas(page, ({ view }, typed) => view.state.selection.$head.parent.textContent.includes(typed), c.raw.typed)).toBe(
			true
		);
		await undoBackTo(page, json);

		// a comment tint and a peer caret with its name
		const drawn = await inCanvas(
			page,
			async ({ probe, view }, needle) => {
				const pluginOf = (name: string) =>
					view.state.plugins.find((plugin) => String((plugin as unknown as { key: string }).key).startsWith(name))!;
				const from = probe.posOf(needle);
				const to = from + needle.length;
				view.dispatch(
					view.state.tr.setMeta(pluginOf('texpile-comments'), { type: 'set', ranges: [{ id: 't1', from, to, resolved: false }] })
				);
				const peer = { clientId: 7, name: 'Ada', color: '#7c3aed', anchor: from, head: from };
				view.dispatch(view.state.tr.setMeta(pluginOf('remote-cursors'), [peer]).setMeta('addToHistory', false));
				await probe.settle();
				const tints = probe
					.drawList(view.state.doc.resolve(from).before(1))
					.filter((op) => op.op === 'fillRect' && /^rgba\(234, 179, 8, 0\.14/.test(op.color ?? '')).length;
				const peers = probe.carets().filter((caret) => caret.kind === 'remote');
				view.dispatch(view.state.tr.setMeta(pluginOf('texpile-comments'), { type: 'set', ranges: [] }));
				view.dispatch(view.state.tr.setMeta(pluginOf('remote-cursors'), []).setMeta('addToHistory', false));
				return { tints, peers: peers.map((caret) => caret.label), caret: peers[0]?.rect.left, at: probe.rectOf(from)!.left };
			},
			'in the middle'
		);
		expect(drawn.tints, 'the commented words tinted once').toBe(1);
		expect(drawn.peers).toEqual(['Ada']);
		expect(drawn.caret!).toBeCloseTo(drawn.at - 1, 0);

		expect(await docJson(page)).toBe(json);
		await disk.expectFile(c.file, (text) => text === original.toString('utf8'), `${c.file} back to its bytes once every edit is undone`);
		expect(await probeErrors(page)).toEqual([]);
	});
