// W3's slice (20.2): a paragraph holding chips and a formula, triple clicked and copied, is pasted after the last
// paragraph as it was and drawn the same, in LaTeX, Typst and Markdown. The clipboard holds the language's own text, and
// the saved file is what the DOM editor saved after the same steps (canvas/p0-dom, 2026-11-18). P0's clipboard key rows
// (Shift+Delete, Ctrl+Insert, Shift+Insert) replay on the sweep documents
import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type ElectronApplication } from '@playwright/test';
import { Disk } from '../../driver/disk';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const TEX_LINE = 'A reference \\ref{intro}, a note\\footnote{The note.} and the formula $x^2+y^2$ sit in this sentence.';
const TYP_LINE = 'A reference @intro, a note#footnote[The note.] and the formula $x^2 + y^2$ sit in this sentence.';
const MD_LINE = 'A raw chip <kbd>Ctrl</kbd> and the formula $x^2+y^2$ sit in this sentence.';
const texOf = (...lines: string[]) =>
	['\\documentclass{article}', '\\begin{document}', '', '\\section{Intro}\\label{intro}', '', ...lines, '', '\\end{document}', ''].join(
		'\n'
	);
const typOf = (...lines: string[]) => ['= Intro <intro>', '', ...lines, ''].join('\n');
const mdOf = (...lines: string[]) => ['# Intro', '', ...lines, ''].join('\n');
/** the line copied, the last paragraph, the copy pasted and the line pasted alone, as the DOM editor saved them */
const savedLines = (line: string) => [line, '', 'The last paragraph.', '', line, '', line];

type ClipboardCase = {
	file: string;
	line: string;
	/** the node types of the chips in the paragraph */
	chips: string[];
	/** the drawn chip's class, which a pasted copy draws once more */
	drawn: string | null;
	saved: string;
};

const CASES: ClipboardCase[] = [
	{ file: 'clip.tex', line: TEX_LINE, chips: ['ref', 'inline_latex'], drawn: '.drawn-footnote', saved: texOf(...savedLines(TEX_LINE)) },
	{ file: 'clip.typ', line: TYP_LINE, chips: ['typ_ref', 'inline_latex'], drawn: '.drawn-footnote', saved: typOf(...savedLines(TYP_LINE)) },
	{ file: 'clip.md', line: MD_LINE, chips: ['inline_latex'], drawn: null, saved: mdOf(...savedLines(MD_LINE)) }
];

const KEYS = path.resolve(import.meta.dirname, '../../../fixtures/parity/keys');
const SWEEP = ['sweep.tex', 'sweep.typ', 'sweep.md'];

const texpile = useTexpile({
	files: {
		'clip.tex': texOf(TEX_LINE, '', 'The last paragraph.'),
		'clip.typ': typOf(TYP_LINE, '', 'The last paragraph.'),
		'clip.md': mdOf(MD_LINE, '', 'The last paragraph.'),
		...Object.fromEntries(SWEEP.map((file) => [`keys-sweep/${file}`, fs.readFileSync(path.join(KEYS, 'keys-sweep', file), 'utf8')]))
	}
});

type KeyRow = [key: number, type: string, anchor: number, head: number, extra?: { ds?: number; unstable?: boolean }];
type KeyFixture = {
	keys: { id: string; key: string; kind: string }[];
	starts: { cat: string; sel: [string, number, number]; rows: KeyRow[]; unstable?: boolean }[];
};
/** the selection after a key and the change of the document's size, as P0 recorded them */
type KeyOutcome = [type: string, anchor: number, head: number, sizeChange: number];

type ClipboardText = { text: string; html?: string };

/** the system clipboard, through Electron's own (async since Electron 44) */
function readClipboard(app: ElectronApplication): Promise<ClipboardText> {
	return app.evaluate(async ({ clipboard }) => {
		const [item] = await clipboard.read();
		const read = async (type: string) => (item?.types.includes(type) ? ((await item.getType(type)) as Blob).text() : '');
		return { text: await read('text/plain'), html: await read('text/html') };
	});
}

function writeClipboard(app: ElectronApplication, written: ClipboardText): Promise<void> {
	return app.evaluate(async ({ clipboard, ClipboardItem }, { text, html }) => {
		await clipboard.write([new ClipboardItem(html ? { 'text/plain': text, 'text/html': html } : { 'text/plain': text })]);
	}, written);
}

type BlockSummary = { pos: number; json: string; drawn: string[] };

/** each top-level block holding `needle`: its content without parse origins, and the words it draws */
function blocksHolding(visual: VisualEditor, needle: string): Promise<BlockSummary[]> {
	return inCanvas(
		visual.page,
		({ probe, view }, needle) => {
			const strip = (json: { attrs?: Record<string, unknown>; content?: unknown[] }): unknown => {
				if (json.attrs) json.attrs = Object.fromEntries(Object.entries(json.attrs).filter(([key]) => key !== 'orig'));
				json.content?.forEach((child) => strip(child as typeof json));
				return json;
			};
			const out: BlockSummary[] = [];
			view.state.doc.forEach((node, pos) => {
				if (!node.textContent.includes(needle)) return;
				const ops = probe.drawList(pos).filter((op) => op.op === 'fillText');
				out.push({
					pos,
					json: JSON.stringify(node.content.toJSON()?.map((child: object) => strip(child))),
					drawn: ops.map((op) => op.text!)
				});
			});
			return out;
		},
		needle
	);
}

/** Ctrl+End, then Enter unless the last block is empty */
async function caretOnNewLastLine(visual: VisualEditor): Promise<void> {
	await visual.press('ControlOrMeta+End');
	if (!(await inCanvas(visual.page, ({ view }) => view.state.doc.lastChild!.content.size === 0))) await visual.press('Enter');
	await settled(visual.page);
}

/** the words drawn in order, a footnote mark's number left out: a pasted copy is the next note */
function drawnWords(block: BlockSummary): string[] {
	return block.drawn.map((text) => (/^\d+$/.test(text) ? '#' : text));
}

for (const c of CASES)
	test(`${c.file}: a paragraph holding a chip and a formula copies as its source and pastes back as it was`, async () => {
		const { page, app } = texpile();
		const visual = new VisualEditor(page, texpile().root);
		await visual.open(c.file);
		await settled(page);
		const [original] = await blocksHolding(visual, 'sit in this');
		for (const chip of c.chips) expect(original.json).toContain(`"type":"${chip}"`);
		const drawnChips = () => (c.drawn ? inCanvas(page, ({ probe }, drawn) => probe.query(drawn).length, c.drawn) : Promise.resolve(0));
		const drawnBefore = await drawnChips();

		const word = await inCanvas(page, ({ probe }) => probe.clientPointOf(probe.posOf('sentence') + 3));
		await page.mouse.click(word.x, word.y, { clickCount: 3 });
		await settled(page);
		const range = await inCanvas(page, ({ view }) => [view.state.selection.from, view.state.selection.to]);
		const size = await inCanvas(page, ({ view }, at) => view.state.doc.nodeAt(at)!.content.size, original.pos);
		expect(range).toEqual([original.pos + 1, original.pos + 1 + size]);
		await visual.press('ControlOrMeta+c');
		const copied = await readClipboard(app);
		expect(copied.text).toBe(c.line);
		expect(copied.html).toContain('data-pm-slice');

		// written again right before each paste: another spec's window shares the X clipboard
		const paste = async (written: ClipboardText) => {
			await writeClipboard(app, written);
			await visual.press('ControlOrMeta+v');
			await settled(page);
		};
		await caretOnNewLastLine(visual);
		await paste(copied);
		let blocks = await blocksHolding(visual, 'sit in this');
		expect(blocks.length).toBe(2);
		expect(blocks[1].json).toBe(original.json);
		expect(drawnWords(blocks[1])).toEqual(drawnWords(original));
		if (c.drawn) expect(await drawnChips()).toBe(drawnBefore + 1);

		await visual.press('ControlOrMeta+z');
		await settled(page);
		expect((await blocksHolding(visual, 'sit in this')).length).toBe(1);
		await caretOnNewLastLine(visual);
		await paste(copied);
		expect((await blocksHolding(visual, 'sit in this'))[1].json).toBe(original.json);

		// the line alone, as the source editor or another app puts it on the clipboard
		await caretOnNewLastLine(visual);
		await paste({ text: c.line });
		blocks = await blocksHolding(visual, 'sit in this');
		expect(blocks.length).toBe(3);
		expect(blocks[2].json).toBe(original.json);

		await new Disk(texpile().root).expectFile(c.file, (text) => text === c.saved, `${c.file} saved as the DOM editor saved it`);
		expect(await probeErrors(page)).toEqual([]);
	});

for (const file of SWEEP)
	test(`keys-sweep/${file}: Shift+Delete cuts, Ctrl+Insert copies and Shift+Insert pastes as P0 recorded`, async () => {
		const { page, app } = texpile();
		const fixture = JSON.parse(fs.readFileSync(path.join(KEYS, `keys-sweep.${file}.json`), 'utf8')) as KeyFixture;
		const visual = new VisualEditor(page, texpile().root);
		await visual.open(`keys-sweep/${file}`);
		await settled(page);
		const size = await inCanvas(page, ({ view }) => {
			(window as unknown as { w3Original: unknown }).w3Original = view.state.doc;
			return view.state.doc.content.size;
		});
		const focus = await inCanvas(page, ({ probe }) => probe.clientPointOf(3));
		await page.mouse.click(focus.x, focus.y);
		const differ: { start: string; key: string; want: KeyOutcome; got: KeyOutcome }[] = [];
		let rows = 0;
		for (const start of fixture.starts) {
			if (start.unstable || start.sel[0] !== 'text') continue;
			for (const [index, type, anchor, head, extra] of start.rows) {
				const key = fixture.keys[index];
				if (key.kind !== 'clipboard' || extra?.unstable) continue;
				await inCanvas(page, ({ view }) => {
					const original = (window as unknown as { w3Original: typeof view.state.doc }).w3Original;
					view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, original.content).setMeta('addToHistory', false));
				});
				if (key.id === 'paste-shift-insert') await writeClipboard(app, { text: 'PASTE-PROBE' });
				await inCanvas(page, ({ probe }, [from, to]) => probe.select(from, to), [start.sel[1], start.sel[2]]);
				await visual.press(key.key);
				await settled(page);
				const got = await inCanvas(
					page,
					({ view }, size) => {
						const { selection } = view.state;
						return [selection.toJSON().type as string, selection.anchor, selection.head, view.state.doc.content.size - size];
					},
					size
				);
				const want: KeyOutcome = [type, anchor, head, extra?.ds ?? 0];
				rows++;
				if (JSON.stringify(got) !== JSON.stringify(want)) differ.push({ start: start.cat, key: key.id, want, got: got as KeyOutcome });
			}
		}
		expect(rows).toBeGreaterThan(5);
		expect(differ).toEqual([]);
		expect(await probeErrors(page)).toEqual([]);
	});
